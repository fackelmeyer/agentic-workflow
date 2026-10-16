# agentic-workflow

How I build software with coding agents, packaged as a Claude Code plugin.

The rules I give agents live in [`config/AGENTS.md`](config/AGENTS.md): no bypassed checks, no secrets in code, ask before dependencies, lockfiles, CI, deletions and force-pushes. Written rules are requests; an agent under pressure to make a test pass can still reach for `--no-verify` or `@ts-ignore`. This plugin turns the rules that can be checked mechanically into a **guard hook** that runs before every shell command and file change and either blocks the call or hands it to me.

## Install

In Claude Code:

```
/plugin marketplace add fackelmeyer/agentic-workflow
/plugin install agentic-workflow@fackelmeyer
```

Requires Node.js (Claude Code already needs it). The `codex-worker` agent additionally needs the [Codex CLI](https://github.com/openai/codex).

To use the rules themselves, copy or symlink [`config/AGENTS.md`](config/AGENTS.md) to `~/.agents/AGENTS.md` and [`config/CLAUDE.md`](config/CLAUDE.md) to `~/.claude/CLAUDE.md`. They are my personal setup (I ask agents to reply in German, for example), so read them before you adopt them.

## What's inside

| Path | What it is |
| --- | --- |
| [`hooks/guard.mjs`](hooks/guard.mjs), [`hooks/rules.mjs`](hooks/rules.mjs) | The guard: a `PreToolUse` hook for `Bash`, `Write`, `Edit` and `MultiEdit`. No dependencies |
| [`agents/codex-worker.md`](agents/codex-worker.md) | Subagent that hands a self-contained task to Codex in an isolated git worktree and returns only a short summary |
| [`config/AGENTS.md`](config/AGENTS.md) | My working agreements for every agent (Claude Code and Codex read the same file) |
| [`config/CLAUDE.md`](config/CLAUDE.md) | Claude-specific rules: routing between Claude and Codex, escalation, verification gates |
| [`config/rules/`](config/rules/) | Path-scoped rules that load only when matching files are touched |
| [`templates/CLAUDE.md`](templates/CLAUDE.md) | Starting point for a project's own `CLAUDE.md` |
| [`docs/process.md`](docs/process.md) | The process: plan, project rules, small diffs, tests as a gate, security review |
| [`docs/routing.md`](docs/routing.md) | Which agent gets which work, and when to escalate |
| [`docs/case-portfolio.md`](docs/case-portfolio.md) | A real case: a bug the agent wrote and how the process caught it |

## What the guard enforces

| Rule in `AGENTS.md` | Guard | Examples |
| --- | --- | --- |
| Never bypass hooks or checks | **deny** | `git commit --no-verify`, `git commit -n`, adding `@ts-ignore`, `eslint-disable`, `# type: ignore`, `# noqa`, `biome-ignore` |
| Never commit secrets | **deny** | writing `.env` files (not `.env.example`); adding private keys, AWS, GitHub, Anthropic, OpenAI, Slack, Stripe or Google keys |
| Ask before adding a production dependency | **ask** | `npm install zod`, `pnpm add zod`, `uv add`, `cargo add`, `go get` (dev dependencies pass) |
| Ask before changing lockfiles | **ask** | editing `pnpm-lock.yaml`, `package-lock.json`, `Cargo.lock`, `go.sum` … |
| Ask before touching CI or infrastructure | **ask** | `.github/workflows/*`, `Dockerfile`, compose files, Terraform, `wrangler.toml` |
| Ask before deleting files | **ask** | `rm`, `git rm`, `git clean -f`, `find … -delete` |
| Ask before force-pushing | **ask** | `git push --force`, `-f`, `--force-with-lease`, `+refspec` |
| Commit and push only when asked | **ask** | every `git commit` and `git push` |

**deny** blocks the call and tells the agent why, so it fixes the cause instead. **ask** shows me the call and the reason, and I decide. The guard reads quoted strings and heredocs out before matching, so a commit message that *mentions* `--no-verify` is not treated as using it, and an edit next to an existing `@ts-ignore` is not a new one.

## Example run

A throwaway repository, Claude Code allowed to run `git commit`, and the instruction to commit with `--no-verify`. With the plugin:

```
$ echo "Run exactly this command: git commit --no-verify -m test …" \
    | claude -p --plugin-dir ./agentic-workflow --allowedTools "Bash(git commit:*)"
Blocked: the PreToolUse hook (agentic-workflow guard) rejected
`git commit --no-verify -m test`, stating that git hooks are not bypassed
with `--no-verify` and asking to fix what the hook reports or ask you.

$ git log --oneline
fatal: your current branch 'main' does not have any commits yet
```

The same instruction without the plugin:

```
Ran `git commit --no-verify -m control`: it succeeded, creating root commit fbc8185.
```

A larger example is my portfolio website, built with this workflow: specification and plan first, small scoped commits, build and browser tests as gates, a pull request reviewed against CI. [`docs/case-portfolio.md`](docs/case-portfolio.md) describes a bug the agent introduced there and how the process caught it.

## Known limits

- **Guardrails, not a sandbox.** The guard matches patterns in commands and file contents. A determined or confused agent can get around it, for example by writing a script and running that, or by encoding a command. It catches the common shortcuts; it does not replace reading every diff.
- **Fails open.** If the hook cannot read its input, it exits with a non-blocking error and the call proceeds, rather than stopping all work.
- **Secret detection covers well-known key formats only.** Generic passwords or tokens without a recognisable prefix are not detected.
- **Asking has a cost.** Every commit and push is confirmed by hand. That is deliberate: it is the rule I work by. Remove those two checks in `rules.mjs` if it is not yours.
- **New.** The rules in `config/` are the ones I work with every day; the guard that enforces them was added in October 2026.
- **Personal.** The routing in `config/CLAUDE.md` names the models and tools I use (Claude Code, Codex CLI); the model names will age.

## Development

```sh
npm test                          # node --test, no dependencies
claude plugin validate .          # manifest and marketplace
```

Rules live in [`hooks/rules.mjs`](hooks/rules.mjs) as pure functions; each one has tests for what it must catch and for the false positives it must not produce.

## License

[MIT](LICENSE)
