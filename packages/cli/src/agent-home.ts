/**
 * Per-job, throwaway agent state.
 *
 * Job prompts come from strangers on the network. If a job could write the
 * operator's real agent config — `~/.claude/settings.json` hooks, `CLAUDE.md`,
 * `agents/`, `commands/`, `skills/`, an `mcpServers` entry in `~/.claude.json`,
 * `~/.codex/config.toml`, `AGENTS.md` — a prompt-injected agent could plant code
 * that runs OUTSIDE the sandbox the next time the operator uses their agent.
 *
 * So every job gets its own agent home inside the job directory, and the
 * real config dirs stay unwritable (and unreadable) from inside the sandbox:
 *
 *   codex        CODEX_HOME=<job>/.agent-home/codex-home
 *                  auth.json copied in, plus a two-line config.toml that pins
 *                  the model (XORV_CODEX_MODEL, else the operator's top-level
 *                  `model`). Nothing else: no AGENTS.md, hooks, MCP, prompts,
 *                  skills or plugins.
 *   claude-code  CLAUDE_CONFIG_DIR=<job>/.agent-home/claude-home, empty.
 *                  Authentication is the OAuth token the node injects
 *                  (credentials.ts), so no file is copied at all.
 *   opencode     XDG_CONFIG_HOME / XDG_DATA_HOME under the job; only
 *                  opencode's auth.json is copied.
 *
 * The copy runs in the unsandboxed parent before the spawn. The whole home is
 * deleted when the job ends. If Codex refreshed its login during the job, the
 * refreshed auth.json is written back — and only that file, only when it is
 * well-formed and for the same account — so a token rotation inside a job
 * does not silently log the operator out.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AdapterKind } from "@xorv/protocol";

export interface AgentHome {
  /** Root of the throwaway state, inside the job directory. */
  dir: string;
  /** Variables that point the agent CLI at it. */
  env: Record<string, string>;
  /** For codex: where auth.json came from and what it said, for the write-back. */
  codexAuth?: { real: string; copy: string; original: string };
}

/** The operator's REAL agent config paths. Jobs may never write these. */
export function realAgentConfigPaths(home = os.homedir(), env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    env.CODEX_HOME || path.join(home, ".codex"),
    path.join(home, ".claude"),
    path.join(home, ".claude.json"),
    path.join(home, ".config", "opencode"),
    path.join(home, ".local", "share", "opencode"),
    // user-level skills/instructions several agent CLIs auto-load (e.g. ~/.agents/skills)
    path.join(home, ".agents"),
  ];
}

/** Only these top-level keys survive into a job's codex config. */
const CODEX_KEYS = new Set(["model", "model_reasoning_effort"]);

/** The top-level `key = value` lines we allow, from the operator's config.toml (before any [section]). */
export function minimalCodexConfig(realConfig: string, modelOverride?: string): string {
  const out = new Map<string, string>();
  for (const raw of realConfig.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) break;
    const m = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (m && m[1] && m[2] && CODEX_KEYS.has(m[1])) out.set(m[1], m[2]);
  }
  if (modelOverride) out.set("model", JSON.stringify(modelOverride));
  return [...out].map(([k, v]) => `${k} = ${v}`).join("\n") + (out.size ? "\n" : "");
}

function copyIfExists(src: string, dst: string): boolean {
  try {
    if (!fs.statSync(src).isFile()) return false;
    fs.mkdirSync(path.dirname(dst), { recursive: true, mode: 0o700 });
    fs.copyFileSync(src, dst);
    fs.chmodSync(dst, 0o600);
    return true;
  } catch {
    return false;
  }
}

export function prepareAgentHome(
  kind: AdapterKind,
  jobDir: string,
  opts: { home?: string; env?: NodeJS.ProcessEnv } = {},
): AgentHome {
  const home = opts.home ?? os.homedir();
  const env = opts.env ?? process.env;
  const dir = path.join(jobDir, ".agent-home");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const result: AgentHome = { dir, env: {} };

  if (kind === "codex") {
    const realHome = env.CODEX_HOME || path.join(home, ".codex");
    const codexHome = path.join(dir, "codex-home");
    fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
    const real = path.join(realHome, "auth.json");
    const copy = path.join(codexHome, "auth.json");
    if (copyIfExists(real, copy)) result.codexAuth = { real, copy, original: fs.readFileSync(copy, "utf8") };
    let realConfig = "";
    try {
      realConfig = fs.readFileSync(path.join(realHome, "config.toml"), "utf8");
    } catch {
      /* no config: codex defaults */
    }
    fs.writeFileSync(path.join(codexHome, "config.toml"), minimalCodexConfig(realConfig, env.XORV_CODEX_MODEL?.trim() || undefined), { mode: 0o600 });
    result.env.CODEX_HOME = codexHome;
  } else if (kind === "claude-code") {
    const claudeHome = path.join(dir, "claude-home");
    fs.mkdirSync(claudeHome, { recursive: true, mode: 0o700 });
    result.env.CLAUDE_CONFIG_DIR = claudeHome;
  } else if (kind === "opencode") {
    const cfg = path.join(dir, "xdg-config");
    const data = path.join(dir, "xdg-data");
    fs.mkdirSync(cfg, { recursive: true, mode: 0o700 });
    fs.mkdirSync(data, { recursive: true, mode: 0o700 });
    copyIfExists(path.join(home, ".local", "share", "opencode", "auth.json"), path.join(data, "opencode", "auth.json"));
    result.env.XDG_CONFIG_HOME = cfg;
    result.env.XDG_DATA_HOME = data;
  }
  return result;
}

type CodexAuth = { tokens?: { account_id?: string; refresh_token?: string }; last_refresh?: string };

/** End of job: write back a refreshed Codex login if (and only if) it is sane, then delete the home. */
export function finishAgentHome(h: AgentHome | null): void {
  if (!h) return;
  try {
    if (h.codexAuth) {
      const now = fs.readFileSync(h.codexAuth.copy, "utf8");
      if (now !== h.codexAuth.original) {
        const before = JSON.parse(h.codexAuth.original) as CodexAuth;
        const after = JSON.parse(now) as CodexAuth;
        const sameAccount = !!before.tokens?.account_id && before.tokens.account_id === after.tokens?.account_id;
        const newer = (after.last_refresh ?? "") > (before.last_refresh ?? "");
        const keys = Object.keys(after).every((k) => k in before);
        if (sameAccount && newer && keys && typeof after.tokens?.refresh_token === "string") {
          const tmp = `${h.codexAuth.real}.xorv-tmp`;
          fs.writeFileSync(tmp, now, { mode: 0o600 });
          fs.renameSync(tmp, h.codexAuth.real);
        }
      }
    }
  } catch {
    /* a malformed copy is dropped, never written back */
  }
  try {
    fs.rmSync(h.dir, { recursive: true, force: true });
  } catch {
    /* the job dir is removed by the caller anyway */
  }
}
