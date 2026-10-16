# Routing: which agent does what

I work with two coding agents: Claude Code plans and does most implementation; Codex works as a delegated worker. The authoritative version is the "Agent routing" section in [`config/CLAUDE.md`](../config/CLAUDE.md).

| Work | Agent | Why |
| --- | --- | --- |
| Architecture, plans, refactors across more than ten files | Claude | Needs the whole picture and the conversation |
| React/Tailwind UI, implementing designs | Claude | Needs skills and browser tools for verification |
| Anything that needs skills or MCP tools | Claude | Codex has no access to them |
| Go endpoints with tests, SQL migrations with a clear spec | Codex via [`codex-worker`](../agents/codex-worker.md) | Self-contained, testable, little context needed |
| CI, build, shell and Docker failures | Codex | Narrow problem, clear success signal |
| Algorithm- or math-heavy logic, performance analysis | Codex | Strong at it; "MODEL: astra" only for the hardest cases |

## Rules

- **Self-contained briefs.** A Codex brief contains goal, relevant files, Definition of Done and the test command. If it can't be written that way, the task isn't ready for delegation.
- **Default branch only.** `codex-worker` worktrees branch from the default branch, so only work that doesn't depend on unmerged changes is delegated.
- **One implementer per ticket.** Two agents on the same change produce two half-solutions.
- **One cross-review on the finished diff.** Codex reviews Claude's branches; Claude reviews Codex's.
- **Escalation.** Claude fails twice at high effort: switch to a stronger model. Codex fails twice: take the ticket back.

## Why a wrapper agent

`codex-worker` is a deliberately thin wrapper: it never edits code itself, runs Codex in an isolated worktree, and returns only the changed files, the test result and open questions. The full Codex log stays out of the main conversation, so delegation doesn't cost context.
