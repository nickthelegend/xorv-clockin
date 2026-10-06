/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/xorv.json`.
 */
export type Xorv = {
  "address": "GbtmzdtzLjPd1fZRmvVy7rnZzSMrUs6UfDJpZShEwXkw",
  "metadata": {
    "name": "xorv",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Xorv on Solana: per-job AI escrow, SKR-bonded provider reputation, daily clock-in"
  },
  "instructions": [
    {
      "name": "addBond",
      "docs": [
        "Top up the bond (e.g. after a slash)."
      ],
      "discriminator": [
        67,
        104,
        1,
        227,
        44,
        237,
        39,
        95
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "provider"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "provider",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "bondVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              }
            ]
          }
        },
        {
          "name": "authorityAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "checkIn",
      "docs": [
        "The daily loop. Once per day (UTC, `day_length` seconds on devnet = 86400).",
        "Consecutive days grow the streak; the reward is `daily_reward × min(streak, 7)`."
      ],
      "discriminator": [
        209,
        253,
        4,
        217,
        250,
        241,
        207,
        50
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  107,
                  114,
                  45,
                  109,
                  105,
                  110,
                  116
                ]
              }
            ]
          },
          "relations": [
            "config"
          ]
        },
        {
          "name": "stats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "userAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "closeJob",
      "docs": [
        "Reclaim the job account's rent once it is settled."
      ],
      "discriminator": [
        90,
        100,
        180,
        200,
        200,
        163,
        120,
        182
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "heartbeat",
      "docs": [
        "Liveness. The node calls this every minute; the app treats a provider",
        "as live while `last_seen` is recent."
      ],
      "discriminator": [
        202,
        104,
        56,
        6,
        240,
        170,
        63,
        134
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "provider"
          ]
        },
        {
          "name": "provider",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "One-time setup: the config PDA and the devnet stand-in mint it controls."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  107,
                  114,
                  45,
                  109,
                  105,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "dailyReward",
          "type": "u64"
        },
        {
          "name": "minBond",
          "type": "u64"
        },
        {
          "name": "slashBps",
          "type": "u16"
        },
        {
          "name": "jobTimeout",
          "type": "i64"
        },
        {
          "name": "dayLength",
          "type": "i64"
        }
      ]
    },
    {
      "name": "postJob",
      "docs": [
        "The buyer pays the provider's price into a vault owned by the job."
      ],
      "discriminator": [
        34,
        208,
        58,
        248,
        129,
        234,
        179,
        211
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "provider",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "provider.authority",
                "account": "provider"
              }
            ]
          }
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "buyerAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "stats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "prompt",
          "type": "string"
        },
        {
          "name": "maxPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "refund",
      "docs": [
        "Past the deadline, anyone can refund the buyer — and the provider's",
        "bond pays the buyer `slash_bps` of itself for the wasted time."
      ],
      "discriminator": [
        2,
        96,
        183,
        251,
        63,
        208,
        46,
        46
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone may trigger a refund once the deadline has passed."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "provider",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "provider.authority",
                "account": "provider"
              }
            ]
          },
          "relations": [
            "job"
          ]
        },
        {
          "name": "bondVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              }
            ]
          }
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "buyer",
          "writable": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "buyerAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "registerProvider",
      "docs": [
        "A provider node joins the network by staking an SKR bond."
      ],
      "discriminator": [
        254,
        209,
        54,
        184,
        46,
        197,
        109,
        78
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "provider",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "bondVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              }
            ]
          }
        },
        {
          "name": "authorityAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "model",
          "type": "string"
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "bond",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reject",
      "docs": [
        "The provider declines (its agent failed, the prompt was abusive…).",
        "The buyer is refunded at once; it counts as a failure, but no slash —",
        "failing honestly must be cheaper than going silent."
      ],
      "discriminator": [
        135,
        7,
        63,
        85,
        131,
        114,
        111,
        224
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "provider"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "provider",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          },
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "buyer",
          "writable": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "buyerAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "submitResult",
      "docs": [
        "The provider writes its answer, in chunks if it is long. The final",
        "chunk (`done = true`) settles: the escrow pays the provider, the result",
        "hash is recorded, and the provider's record gains a completed job — all",
        "in one instruction, so reputation can't be claimed without delivering."
      ],
      "discriminator": [
        240,
        42,
        89,
        180,
        10,
        239,
        9,
        214
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "provider"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "provider",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          },
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "buyer",
          "writable": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "providerAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "chunk",
          "type": "bytes"
        },
        {
          "name": "done",
          "type": "bool"
        }
      ]
    },
    {
      "name": "updateProvider",
      "discriminator": [
        52,
        208,
        141,
        191,
        164,
        54,
        108,
        150
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "provider"
          ]
        },
        {
          "name": "provider",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "active",
          "type": "bool"
        },
        {
          "name": "model",
          "type": "string"
        }
      ]
    },
    {
      "name": "withdrawBond",
      "docs": [
        "A provider can take its bond back only once it has stopped taking work",
        "and has nothing in flight that could still be slashed."
      ],
      "discriminator": [
        222,
        199,
        141,
        31,
        188,
        93,
        155,
        40
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "provider"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "provider",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "bondVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              }
            ]
          }
        },
        {
          "name": "authorityAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "job",
      "discriminator": [
        75,
        124,
        80,
        203,
        161,
        180,
        202,
        80
      ]
    },
    {
      "name": "provider",
      "discriminator": [
        164,
        180,
        71,
        17,
        75,
        216,
        80,
        195
      ]
    },
    {
      "name": "userStats",
      "discriminator": [
        176,
        223,
        136,
        27,
        122,
        79,
        32,
        227
      ]
    }
  ],
  "events": [
    {
      "name": "checkedIn",
      "discriminator": [
        211,
        80,
        198,
        244,
        196,
        84,
        212,
        150
      ]
    },
    {
      "name": "jobDelivered",
      "discriminator": [
        108,
        92,
        53,
        170,
        59,
        120,
        87,
        40
      ]
    },
    {
      "name": "jobPosted",
      "discriminator": [
        18,
        171,
        12,
        141,
        212,
        169,
        183,
        52
      ]
    },
    {
      "name": "jobRefunded",
      "discriminator": [
        156,
        171,
        111,
        37,
        17,
        174,
        8,
        167
      ]
    },
    {
      "name": "providerRegistered",
      "discriminator": [
        38,
        209,
        137,
        78,
        185,
        19,
        147,
        14
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "badParam",
      "msg": "Invalid parameter"
    },
    {
      "code": 6001,
      "name": "alreadyClockedIn",
      "msg": "Already clocked in today — come back tomorrow"
    },
    {
      "code": 6002,
      "name": "bondTooSmall",
      "msg": "Bond is below the network minimum"
    },
    {
      "code": 6003,
      "name": "providerInactive",
      "msg": "Provider is not taking jobs"
    },
    {
      "code": 6004,
      "name": "priceAboveMax",
      "msg": "Provider's price is above your maximum"
    },
    {
      "code": 6005,
      "name": "notFunded",
      "msg": "Job is not in the funded state"
    },
    {
      "code": 6006,
      "name": "pastDeadline",
      "msg": "Job deadline has passed"
    },
    {
      "code": 6007,
      "name": "beforeDeadline",
      "msg": "Job deadline has not passed yet"
    },
    {
      "code": 6008,
      "name": "resultTooLong",
      "msg": "Result exceeds the maximum length"
    },
    {
      "code": 6009,
      "name": "emptyResult",
      "msg": "Result is empty"
    },
    {
      "code": 6010,
      "name": "stillFunded",
      "msg": "Job is still funded"
    },
    {
      "code": 6011,
      "name": "providerActive",
      "msg": "Deactivate the provider before withdrawing the bond"
    },
    {
      "code": 6012,
      "name": "jobsInFlight",
      "msg": "Provider still has jobs in flight"
    },
    {
      "code": 6013,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "checkedIn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "day",
            "type": "i64"
          },
          {
            "name": "streak",
            "type": "u32"
          },
          {
            "name": "reward",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "dailyReward",
            "type": "u64"
          },
          {
            "name": "minBond",
            "type": "u64"
          },
          {
            "name": "slashBps",
            "type": "u16"
          },
          {
            "name": "jobTimeout",
            "type": "i64"
          },
          {
            "name": "dayLength",
            "type": "i64"
          },
          {
            "name": "providers",
            "type": "u64"
          },
          {
            "name": "jobs",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mintBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "job",
      "docs": [
        "Fixed-offset fields first, so the node can filter with memcmp:",
        "buyer @8, provider @40, status @112."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "slashed",
            "type": "u64"
          },
          {
            "name": "resultHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "prompt",
            "type": "string"
          },
          {
            "name": "result",
            "type": "bytes"
          }
        ]
      }
    },
    {
      "name": "jobDelivered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "resultHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "jobPosted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "jobRefunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "slashed",
            "type": "u64"
          },
          {
            "name": "rejected",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "provider",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "bond",
            "type": "u64"
          },
          {
            "name": "completed",
            "type": "u32"
          },
          {
            "name": "failed",
            "type": "u32"
          },
          {
            "name": "earned",
            "type": "u64"
          },
          {
            "name": "openJobs",
            "type": "u32"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "lastSeen",
            "type": "i64"
          },
          {
            "name": "registeredAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "model",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "providerRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "bond",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "userStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "streak",
            "type": "u32"
          },
          {
            "name": "bestStreak",
            "type": "u32"
          },
          {
            "name": "lastDay",
            "type": "i64"
          },
          {
            "name": "checkins",
            "type": "u32"
          },
          {
            "name": "jobsPosted",
            "type": "u32"
          },
          {
            "name": "claimed",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
