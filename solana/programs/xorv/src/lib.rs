//! Xorv on Solana.
//!
//! The Arbitrum version of Xorv had three contracts: an escrow that held each
//! job's payment until the result arrived, a Stylus registry that recorded
//! every provider's outcome, and a log of receipts. This program is all three,
//! plus the two things a phone-first product needs: an SKR bond that providers
//! stake to be listed, and a once-a-day clock-in.
//!
//! The broker is gone. A provider proves it is alive with `heartbeat`, the
//! buyer's app ranks providers from their on-chain record, the prompt and the
//! result live in the `Job` account, and the provider node polls for work.
//!
//! Money only ever moves three ways out of a job vault:
//!   * to the provider, in the same instruction that records the result hash
//!     and increments `completed`;
//!   * back to the buyer when the provider declines (`reject`);
//!   * back to the buyer when the deadline passes (`refund`, callable by
//!     anyone), together with a slice of the provider's bond.
//!
//! Devnet note: the token is a program-owned stand-in mint ("tSKR"). On
//! mainnet the mint would be SKR and `check_in` would pay from a funded
//! rewards pool rather than mint.

use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("GbtmzdtzLjPd1fZRmvVy7rnZzSMrUs6UfDJpZShEwXkw");

pub const MAX_NAME: usize = 32;
pub const MAX_MODEL: usize = 48;
pub const MAX_PROMPT: usize = 512;
pub const MAX_RESULT: usize = 2048;
/// The streak multiplier caps here: a week of clocking in is worth 7x a day.
pub const MAX_MULTIPLIER: u32 = 7;
pub const MAX_SLASH_BPS: u16 = 5_000;

pub const STATUS_FUNDED: u8 = 0;
pub const STATUS_DELIVERED: u8 = 1;
pub const STATUS_REFUNDED: u8 = 2;
pub const STATUS_REJECTED: u8 = 3;

#[program]
pub mod xorv {
    use super::*;

    /// One-time setup: the config PDA and the devnet stand-in mint it controls.
    pub fn initialize(
        ctx: Context<Initialize>,
        daily_reward: u64,
        min_bond: u64,
        slash_bps: u16,
        job_timeout: i64,
        day_length: i64,
    ) -> Result<()> {
        require!(slash_bps <= MAX_SLASH_BPS, XorvError::BadParam);
        require!(job_timeout > 0 && day_length > 0, XorvError::BadParam);
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.mint = ctx.accounts.mint.key();
        c.daily_reward = daily_reward;
        c.min_bond = min_bond;
        c.slash_bps = slash_bps;
        c.job_timeout = job_timeout;
        c.day_length = day_length;
        c.providers = 0;
        c.jobs = 0;
        c.bump = ctx.bumps.config;
        c.mint_bump = ctx.bumps.mint;
        Ok(())
    }

    /// The daily loop. Once per day (UTC, `day_length` seconds on devnet = 86400).
    /// Consecutive days grow the streak; the reward is `daily_reward × min(streak, 7)`.
    pub fn check_in(ctx: Context<CheckIn>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let cfg = &ctx.accounts.config;
        let day = now / cfg.day_length;
        let s = &mut ctx.accounts.stats;
        if s.wallet == Pubkey::default() {
            s.wallet = ctx.accounts.user.key();
            s.bump = ctx.bumps.stats;
        }
        if s.checkins > 0 {
            require!(day > s.last_day, XorvError::AlreadyClockedIn);
            s.streak = if day == s.last_day + 1 { s.streak + 1 } else { 1 };
        } else {
            s.streak = 1;
        }
        s.last_day = day;
        s.checkins += 1;
        s.best_streak = s.best_streak.max(s.streak);
        let multiplier = s.streak.min(MAX_MULTIPLIER) as u64;
        let reward = cfg.daily_reward.checked_mul(multiplier).ok_or(XorvError::Overflow)?;
        s.claimed = s.claimed.checked_add(reward).ok_or(XorvError::Overflow)?;

        let seeds: &[&[u8]] = &[b"config", &[cfg.bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[seeds],
            ),
            reward,
        )?;
        emit!(CheckedIn {
            wallet: s.wallet,
            day,
            streak: s.streak,
            reward
        });
        Ok(())
    }

    /// A provider node joins the network by staking an SKR bond.
    pub fn register_provider(
        ctx: Context<RegisterProvider>,
        name: String,
        model: String,
        price: u64,
        bond: u64,
    ) -> Result<()> {
        require!(!name.is_empty() && name.len() <= MAX_NAME, XorvError::BadParam);
        require!(model.len() <= MAX_MODEL, XorvError::BadParam);
        require!(price > 0, XorvError::BadParam);
        require!(bond >= ctx.accounts.config.min_bond, XorvError::BondTooSmall);
        let now = Clock::get()?.unix_timestamp;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.authority_ata.to_account_info(),
                    to: ctx.accounts.bond_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            bond,
        )?;

        let p = &mut ctx.accounts.provider;
        p.authority = ctx.accounts.authority.key();
        p.name = name;
        p.model = model;
        p.price = price;
        p.bond = bond;
        p.completed = 0;
        p.failed = 0;
        p.earned = 0;
        p.open_jobs = 0;
        p.active = true;
        p.last_seen = now;
        p.registered_at = now;
        p.bump = ctx.bumps.provider;
        p.vault_bump = ctx.bumps.bond_vault;
        ctx.accounts.config.providers += 1;
        emit!(ProviderRegistered {
            provider: p.key(),
            authority: p.authority,
            price,
            bond
        });
        Ok(())
    }

    pub fn update_provider(ctx: Context<UpdateProvider>, price: u64, active: bool, model: String) -> Result<()> {
        require!(price > 0, XorvError::BadParam);
        require!(model.len() <= MAX_MODEL, XorvError::BadParam);
        let p = &mut ctx.accounts.provider;
        p.price = price;
        p.active = active;
        p.model = model;
        p.last_seen = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Liveness. The node calls this every minute; the app treats a provider
    /// as live while `last_seen` is recent.
    pub fn heartbeat(ctx: Context<UpdateProvider>) -> Result<()> {
        ctx.accounts.provider.last_seen = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Top up the bond (e.g. after a slash).
    pub fn add_bond(ctx: Context<AddBond>, amount: u64) -> Result<()> {
        require!(amount > 0, XorvError::BadParam);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.authority_ata.to_account_info(),
                    to: ctx.accounts.bond_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
        let p = &mut ctx.accounts.provider;
        p.bond = p.bond.checked_add(amount).ok_or(XorvError::Overflow)?;
        Ok(())
    }

    /// A provider can take its bond back only once it has stopped taking work
    /// and has nothing in flight that could still be slashed.
    pub fn withdraw_bond(ctx: Context<WithdrawBond>) -> Result<()> {
        let p = &ctx.accounts.provider;
        require!(!p.active, XorvError::ProviderActive);
        require!(p.open_jobs == 0, XorvError::JobsInFlight);
        let amount = ctx.accounts.bond_vault.amount;
        let auth = p.authority;
        let seeds: &[&[u8]] = &[b"provider", auth.as_ref(), &[p.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.bond_vault.to_account_info(),
                    to: ctx.accounts.authority_ata.to_account_info(),
                    authority: ctx.accounts.provider.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        ctx.accounts.provider.bond = 0;
        Ok(())
    }

    /// The buyer pays the provider's price into a vault owned by the job.
    pub fn post_job(ctx: Context<PostJob>, nonce: u64, prompt: String, max_price: u64) -> Result<()> {
        require!(!prompt.is_empty() && prompt.len() <= MAX_PROMPT, XorvError::BadParam);
        let p = &mut ctx.accounts.provider;
        require!(p.active, XorvError::ProviderInactive);
        let amount = p.price;
        require!(amount <= max_price, XorvError::PriceAboveMax);
        let now = Clock::get()?.unix_timestamp;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_ata.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            amount,
        )?;
        p.open_jobs += 1;

        let j = &mut ctx.accounts.job;
        j.buyer = ctx.accounts.buyer.key();
        j.provider = p.key();
        j.nonce = nonce;
        j.amount = amount;
        j.created_at = now;
        j.deadline = now + ctx.accounts.config.job_timeout;
        j.settled_at = 0;
        j.status = STATUS_FUNDED;
        j.slashed = 0;
        j.result_hash = [0u8; 32];
        j.prompt = prompt;
        j.result = Vec::new();
        j.bump = ctx.bumps.job;
        j.vault_bump = ctx.bumps.vault;

        let s = &mut ctx.accounts.stats;
        if s.wallet == Pubkey::default() {
            s.wallet = ctx.accounts.buyer.key();
            s.bump = ctx.bumps.stats;
        }
        s.jobs_posted += 1;
        ctx.accounts.config.jobs += 1;
        emit!(JobPosted {
            job: j.key(),
            buyer: j.buyer,
            provider: j.provider,
            amount,
            deadline: j.deadline
        });
        Ok(())
    }

    /// The provider writes its answer, in chunks if it is long. The final
    /// chunk (`done = true`) settles: the escrow pays the provider, the result
    /// hash is recorded, and the provider's record gains a completed job — all
    /// in one instruction, so reputation can't be claimed without delivering.
    pub fn submit_result(ctx: Context<Settle>, chunk: Vec<u8>, done: bool) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        {
            let j = &mut ctx.accounts.job;
            require!(j.status == STATUS_FUNDED, XorvError::NotFunded);
            require!(now <= j.deadline, XorvError::PastDeadline);
            require!(j.result.len() + chunk.len() <= MAX_RESULT, XorvError::ResultTooLong);
            j.result.extend_from_slice(&chunk);
            if !done {
                return Ok(());
            }
            require!(!j.result.is_empty(), XorvError::EmptyResult);
        }
        pay_out(
            &ctx.accounts.job,
            &ctx.accounts.vault,
            &ctx.accounts.provider_ata.to_account_info(),
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.token_program,
        )?;
        let j = &mut ctx.accounts.job;
        j.result_hash = hash(&j.result).to_bytes();
        j.status = STATUS_DELIVERED;
        j.settled_at = now;
        let p = &mut ctx.accounts.provider;
        p.completed += 1;
        p.earned = p.earned.checked_add(j.amount).ok_or(XorvError::Overflow)?;
        p.open_jobs = p.open_jobs.saturating_sub(1);
        p.last_seen = now;
        emit!(JobDelivered {
            job: j.key(),
            provider: p.key(),
            amount: j.amount,
            result_hash: j.result_hash
        });
        Ok(())
    }

    /// The provider declines (its agent failed, the prompt was abusive…).
    /// The buyer is refunded at once; it counts as a failure, but no slash —
    /// failing honestly must be cheaper than going silent.
    pub fn reject(ctx: Context<Reject>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(ctx.accounts.job.status == STATUS_FUNDED, XorvError::NotFunded);
        pay_out(
            &ctx.accounts.job,
            &ctx.accounts.vault,
            &ctx.accounts.buyer_ata.to_account_info(),
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.token_program,
        )?;
        let j = &mut ctx.accounts.job;
        j.status = STATUS_REJECTED;
        j.settled_at = now;
        let p = &mut ctx.accounts.provider;
        p.failed += 1;
        p.open_jobs = p.open_jobs.saturating_sub(1);
        emit!(JobRefunded {
            job: j.key(),
            buyer: j.buyer,
            amount: j.amount,
            slashed: 0,
            rejected: true
        });
        Ok(())
    }

    /// Past the deadline, anyone can refund the buyer — and the provider's
    /// bond pays the buyer `slash_bps` of itself for the wasted time.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(ctx.accounts.job.status == STATUS_FUNDED, XorvError::NotFunded);
        require!(now > ctx.accounts.job.deadline, XorvError::BeforeDeadline);
        pay_out(
            &ctx.accounts.job,
            &ctx.accounts.vault,
            &ctx.accounts.buyer_ata.to_account_info(),
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.token_program,
        )?;

        let p = &ctx.accounts.provider;
        let slash = ((p.bond as u128) * (ctx.accounts.config.slash_bps as u128) / 10_000u128) as u64;
        let slash = slash.min(ctx.accounts.bond_vault.amount);
        if slash > 0 {
            let auth = p.authority;
            let seeds: &[&[u8]] = &[b"provider", auth.as_ref(), &[p.bump]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.bond_vault.to_account_info(),
                        to: ctx.accounts.buyer_ata.to_account_info(),
                        authority: ctx.accounts.provider.to_account_info(),
                    },
                    &[seeds],
                ),
                slash,
            )?;
        }
        let p = &mut ctx.accounts.provider;
        p.bond = p.bond.saturating_sub(slash);
        p.failed += 1;
        p.open_jobs = p.open_jobs.saturating_sub(1);
        let j = &mut ctx.accounts.job;
        j.status = STATUS_REFUNDED;
        j.slashed = slash;
        j.settled_at = now;
        emit!(JobRefunded {
            job: j.key(),
            buyer: j.buyer,
            amount: j.amount,
            slashed: slash,
            rejected: false
        });
        Ok(())
    }

    /// Reclaim the job account's rent once it is settled.
    pub fn close_job(ctx: Context<CloseJob>) -> Result<()> {
        require!(ctx.accounts.job.status != STATUS_FUNDED, XorvError::StillFunded);
        Ok(())
    }
}

/// Move the whole vault to `to`, then close the vault, returning its rent to
/// the buyer who paid it.
fn pay_out<'info>(
    job: &Account<'info, Job>,
    vault: &Account<'info, TokenAccount>,
    to: &AccountInfo<'info>,
    rent_to: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    let nonce = job.nonce.to_le_bytes();
    let seeds: &[&[u8]] = &[b"job", job.buyer.as_ref(), &nonce, &[job.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: vault.to_account_info(),
                to: to.clone(),
                authority: job.to_account_info(),
            },
            &[seeds],
        ),
        vault.amount,
    )?;
    token::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_to.clone(),
            authority: job.to_account_info(),
        },
        &[seeds],
    ))
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub daily_reward: u64,
    pub min_bond: u64,
    pub slash_bps: u16,
    pub job_timeout: i64,
    pub day_length: i64,
    pub providers: u64,
    pub jobs: u64,
    pub bump: u8,
    pub mint_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Provider {
    pub authority: Pubkey,
    pub price: u64,
    pub bond: u64,
    pub completed: u32,
    pub failed: u32,
    pub earned: u64,
    pub open_jobs: u32,
    pub active: bool,
    pub last_seen: i64,
    pub registered_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
    #[max_len(MAX_NAME)]
    pub name: String,
    #[max_len(MAX_MODEL)]
    pub model: String,
}

/// Fixed-offset fields first, so the node can filter with memcmp:
/// buyer @8, provider @40, status @112.
#[account]
#[derive(InitSpace)]
pub struct Job {
    pub buyer: Pubkey,
    pub provider: Pubkey,
    pub nonce: u64,
    pub amount: u64,
    pub created_at: i64,
    pub deadline: i64,
    pub settled_at: i64,
    pub status: u8,
    pub slashed: u64,
    pub result_hash: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
    #[max_len(MAX_PROMPT)]
    pub prompt: String,
    #[max_len(MAX_RESULT)]
    pub result: Vec<u8>,
}

#[account]
#[derive(InitSpace)]
pub struct UserStats {
    pub wallet: Pubkey,
    pub streak: u32,
    pub best_streak: u32,
    pub last_day: i64,
    pub checkins: u32,
    pub jobs_posted: u32,
    pub claimed: u64,
    pub bump: u8,
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(init, payer = admin, seeds = [b"skr-mint"], bump, mint::decimals = 6, mint::authority = config)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckIn<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = mint)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [b"skr-mint"], bump = config.mint_bump)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(init_if_needed, payer = user, space = 8 + UserStats::INIT_SPACE, seeds = [b"user", user.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    #[account(init_if_needed, payer = user, associated_token::mint = mint, associated_token::authority = user)]
    pub user_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterProvider<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = mint)]
    pub config: Box<Account<'info, Config>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(init, payer = authority, space = 8 + Provider::INIT_SPACE, seeds = [b"provider", authority.key().as_ref()], bump)]
    pub provider: Box<Account<'info, Provider>>,
    #[account(init, payer = authority, seeds = [b"bond", provider.key().as_ref()], bump, token::mint = mint, token::authority = provider)]
    pub bond_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = authority)]
    pub authority_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProvider<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"provider", authority.key().as_ref()], bump = provider.bump, has_one = authority)]
    pub provider: Account<'info, Provider>,
}

#[derive(Accounts)]
pub struct AddBond<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = mint)]
    pub config: Box<Account<'info, Config>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [b"provider", authority.key().as_ref()], bump = provider.bump, has_one = authority)]
    pub provider: Box<Account<'info, Provider>>,
    #[account(mut, seeds = [b"bond", provider.key().as_ref()], bump = provider.vault_bump)]
    pub bond_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = authority)]
    pub authority_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawBond<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = mint)]
    pub config: Box<Account<'info, Config>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [b"provider", authority.key().as_ref()], bump = provider.bump, has_one = authority)]
    pub provider: Box<Account<'info, Provider>>,
    #[account(mut, seeds = [b"bond", provider.key().as_ref()], bump = provider.vault_bump)]
    pub bond_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = authority)]
    pub authority_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct PostJob<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = mint)]
    pub config: Box<Account<'info, Config>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [b"provider", provider.authority.as_ref()], bump = provider.bump)]
    pub provider: Box<Account<'info, Provider>>,
    #[account(init, payer = buyer, space = 8 + Job::INIT_SPACE, seeds = [b"job", buyer.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub job: Box<Account<'info, Job>>,
    #[account(init, payer = buyer, seeds = [b"vault", job.key().as_ref()], bump, token::mint = mint, token::authority = job)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = buyer)]
    pub buyer_ata: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = buyer, space = 8 + UserStats::INIT_SPACE, seeds = [b"user", buyer.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = mint)]
    pub config: Box<Account<'info, Config>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [b"provider", authority.key().as_ref()], bump = provider.bump, has_one = authority)]
    pub provider: Box<Account<'info, Provider>>,
    #[account(mut, has_one = provider, has_one = buyer)]
    pub job: Box<Account<'info, Job>>,
    /// CHECK: receives the vault's rent; pinned to `job.buyer` by `has_one`.
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"vault", job.key().as_ref()], bump = job.vault_bump)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = authority, associated_token::mint = mint, associated_token::authority = authority)]
    pub provider_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Reject<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = mint)]
    pub config: Box<Account<'info, Config>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [b"provider", authority.key().as_ref()], bump = provider.bump, has_one = authority)]
    pub provider: Box<Account<'info, Provider>>,
    #[account(mut, has_one = provider, has_one = buyer)]
    pub job: Box<Account<'info, Job>>,
    /// CHECK: receives the vault's rent; pinned to `job.buyer` by `has_one`.
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"vault", job.key().as_ref()], bump = job.vault_bump)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = buyer)]
    pub buyer_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    /// Anyone may trigger a refund once the deadline has passed.
    pub caller: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = mint)]
    pub config: Box<Account<'info, Config>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [b"provider", provider.authority.as_ref()], bump = provider.bump)]
    pub provider: Box<Account<'info, Provider>>,
    #[account(mut, seeds = [b"bond", provider.key().as_ref()], bump = provider.vault_bump)]
    pub bond_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one = provider, has_one = buyer)]
    pub job: Box<Account<'info, Job>>,
    /// CHECK: receives the vault's rent; pinned to `job.buyer` by `has_one`.
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"vault", job.key().as_ref()], bump = job.vault_bump)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = buyer)]
    pub buyer_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseJob<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, close = buyer, has_one = buyer)]
    pub job: Box<Account<'info, Job>>,
}

// ---------------------------------------------------------------------------
// Events & errors
// ---------------------------------------------------------------------------

#[event]
pub struct CheckedIn {
    pub wallet: Pubkey,
    pub day: i64,
    pub streak: u32,
    pub reward: u64,
}

#[event]
pub struct ProviderRegistered {
    pub provider: Pubkey,
    pub authority: Pubkey,
    pub price: u64,
    pub bond: u64,
}

#[event]
pub struct JobPosted {
    pub job: Pubkey,
    pub buyer: Pubkey,
    pub provider: Pubkey,
    pub amount: u64,
    pub deadline: i64,
}

#[event]
pub struct JobDelivered {
    pub job: Pubkey,
    pub provider: Pubkey,
    pub amount: u64,
    pub result_hash: [u8; 32],
}

#[event]
pub struct JobRefunded {
    pub job: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub slashed: u64,
    pub rejected: bool,
}

#[error_code]
pub enum XorvError {
    #[msg("Invalid parameter")]
    BadParam,
    #[msg("Already clocked in today — come back tomorrow")]
    AlreadyClockedIn,
    #[msg("Bond is below the network minimum")]
    BondTooSmall,
    #[msg("Provider is not taking jobs")]
    ProviderInactive,
    #[msg("Provider's price is above your maximum")]
    PriceAboveMax,
    #[msg("Job is not in the funded state")]
    NotFunded,
    #[msg("Job deadline has passed")]
    PastDeadline,
    #[msg("Job deadline has not passed yet")]
    BeforeDeadline,
    #[msg("Result exceeds the maximum length")]
    ResultTooLong,
    #[msg("Result is empty")]
    EmptyResult,
    #[msg("Job is still funded")]
    StillFunded,
    #[msg("Deactivate the provider before withdrawing the bond")]
    ProviderActive,
    #[msg("Provider still has jobs in flight")]
    JobsInFlight,
    #[msg("Arithmetic overflow")]
    Overflow,
}
