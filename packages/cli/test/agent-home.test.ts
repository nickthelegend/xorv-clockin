import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { finishAgentHome, minimalCodexConfig, prepareAgentHome } from "../src/agent-home.js";

let home: string;
let job: string;

const write = (p: string, body: string) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};
const auth = (account: string, refreshed: string, refresh = "r1") =>
  JSON.stringify({ OPENAI_API_KEY: null, tokens: { account_id: account, refresh_token: refresh, access_token: "a" }, last_refresh: refreshed });

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "xorv-home-"));
  job = fs.mkdtempSync(path.join(os.tmpdir(), "xorv-job-"));
  // an operator's real, fully loaded agent config
  write(path.join(home, ".codex", "auth.json"), auth("acct-1", "2026-10-01T00:00:00Z"));
  write(path.join(home, ".codex", "config.toml"), 'model = "gpt-6"\nmodel_reasoning_effort = "low"\nnotify = ["sh", "-c", "evil"]\n[mcp_servers.x]\ncommand = "evil"\n');
  write(path.join(home, ".codex", "AGENTS.md"), "do evil");
  write(path.join(home, ".codex", "hooks.json"), "{}");
  write(path.join(home, ".codex", "prompts", "p.md"), "evil");
  write(path.join(home, ".codex", "skills", "s", "SKILL.md"), "evil");
  write(path.join(home, ".claude", "settings.json"), '{"hooks":{"PreToolUse":[]}}');
  write(path.join(home, ".claude", "CLAUDE.md"), "evil");
  write(path.join(home, ".claude", "agents", "a.md"), "evil");
  write(path.join(home, ".claude", "commands", "c.md"), "evil");
  write(path.join(home, ".claude.json"), '{"mcpServers":{"x":{"command":"evil"}}}');
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(job, { recursive: true, force: true });
});

const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)).map((f) => path.join(d.name, f)) : [d.name]));

describe("per-job agent home", () => {
  it("points CODEX_HOME / CLAUDE_CONFIG_DIR / XDG dirs inside the job directory", () => {
    for (const [kind, keys] of [["codex", ["CODEX_HOME"]], ["claude-code", ["CLAUDE_CONFIG_DIR"]], ["opencode", ["XDG_CONFIG_HOME", "XDG_DATA_HOME"]]] as const) {
      const h = prepareAgentHome(kind, job, { home, env: {} });
      for (const k of keys) {
        expect(h.env[k]).toBeDefined();
        expect(h.env[k]!.startsWith(job + path.sep)).toBe(true);
      }
    }
  });

  it("copies only codex's auth.json and a model-only config.toml — no hooks, MCP, AGENTS.md, prompts or skills", () => {
    const h = prepareAgentHome("codex", job, { home, env: {} });
    expect(files(h.env.CODEX_HOME!).sort()).toEqual(["auth.json", "config.toml"]);
    const cfg = fs.readFileSync(path.join(h.env.CODEX_HOME!, "config.toml"), "utf8");
    expect(cfg).toBe('model = "gpt-6"\nmodel_reasoning_effort = "low"\n');
    expect(cfg).not.toMatch(/mcp|notify|evil/);
  });

  it("copies nothing at all for claude (it authenticates with the injected token)", () => {
    const h = prepareAgentHome("claude-code", job, { home, env: {} });
    expect(files(h.env.CLAUDE_CONFIG_DIR!)).toEqual([]);
  });

  it("pins the model from XORV_CODEX_MODEL", () => {
    expect(minimalCodexConfig('model = "gpt-6"\n', "gpt-5.5")).toBe('model = "gpt-5.5"\n');
    const h = prepareAgentHome("codex", job, { home, env: { XORV_CODEX_MODEL: "gpt-5.5" } });
    expect(fs.readFileSync(path.join(h.env.CODEX_HOME!, "config.toml"), "utf8")).toContain('model = "gpt-5.5"');
  });

  it("deletes the home after the job and writes back only a sane, same-account refreshed login", () => {
    const realAuth = path.join(home, ".codex", "auth.json");
    const h = prepareAgentHome("codex", job, { home, env: {} });
    fs.writeFileSync(path.join(h.env.CODEX_HOME!, "auth.json"), auth("acct-1", "2026-10-12T00:00:00Z", "r2"));
    finishAgentHome(h);
    expect(fs.existsSync(h.dir)).toBe(false);
    expect(JSON.parse(fs.readFileSync(realAuth, "utf8")).tokens.refresh_token).toBe("r2");

    const h2 = prepareAgentHome("codex", job, { home, env: {} });
    fs.writeFileSync(path.join(h2.env.CODEX_HOME!, "auth.json"), auth("attacker", "2027-01-01T00:00:00Z", "r9"));
    finishAgentHome(h2);
    expect(JSON.parse(fs.readFileSync(realAuth, "utf8")).tokens.account_id).toBe("acct-1");

    const h3 = prepareAgentHome("codex", job, { home, env: {} });
    fs.writeFileSync(path.join(h3.env.CODEX_HOME!, "auth.json"), '{"tokens":{"account_id":"acct-1"},"last_refresh":"2027","mcpServers":{}}');
    finishAgentHome(h3);
    expect(fs.readFileSync(realAuth, "utf8")).not.toContain("mcpServers");
  });
});
