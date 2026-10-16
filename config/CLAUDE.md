@~/.agents/AGENTS.md

## Claude Code specifics
- Code intelligence: the TypeScript/Go/Rust LSP plugins report diagnostics after edits; use them instead of running `tsc` or `go vet` to find type errors. For symbol navigation and refactors prefer the `agent-lsp` MCP tools over grep. If a server is not connected, fall back to built-in tools silently.
- Superpowers: brainstorm → plan → TDD for multi-file features; skip it for one-file fixes.
- Browser verification: Playwright MCP for functional checks; Chrome DevTools MCP only for network/performance questions.
- UI work: run `web-design-guidelines` as the accessibility gate before finishing.
- Flutter app testing rules live in `~/.claude/rules/flutter-testing.md` and load when Dart files are touched.
- When compacting, preserve the list of modified files, the build/test commands used and their last result.

<!-- agent-lsp:rules:start -->
## agent-lsp
MCP server `agent-lsp` (language-server tools for C/C++, Go, JS/TS; workflow prompts via `prompts/get <name>`, exposed as `/mcp__agent-lsp__<name>`).
- Navigate with `find_symbol`, `find_references`, `find_callers`, `inspect_symbol`, `list_symbols` instead of grep/Read for code questions.
- Before editing an exported symbol: `blast_radius`. After edits: `get_diagnostics`, then the project's build and tests.
- Useful workflows: lsp-onboard, lsp-impact, lsp-rename, lsp-refactor, lsp-dead-code, lsp-verify.
<!-- agent-lsp:rules:end -->

## Agent routing (Claude plans, Codex is a worker)
- Codex via the `codex-worker` subagent: Go endpoints + tests, SQL migrations with a clear spec, CI/build/shell/Docker failures, algorithm- or math-heavy logic, performance analysis. Self-contained brief: goal, files, Definition of Done, test command.
- Claude: React/Tailwind/shadcn UI, implementing designs, refactors across >10 files, architecture and plans, anything that needs skills or MCP tools (browser checks, Flutter app testing).
- Rust and Flutter/Dart: no evidence either way. Default to Claude; occasionally A/B one ticket on both.
- `codex-worker` worktrees branch from the default branch, not HEAD. Only delegate work that does not depend on unmerged changes.
- One implementer per ticket. One cross-review on the finished diff: `/codex:adversarial-review` for Claude branches, Opus reviews Codex branches.
- Escalation: Opus fails twice at `xhigh` → `/model fable`. Codex fails twice → take the ticket back.
