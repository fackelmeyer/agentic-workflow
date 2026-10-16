# Working agreements (global)

## Communication
- Reply in German unless the codebase, commit, or PR is in English. Code, comments, identifiers, commit messages: English.
- Be direct. State trade-offs and what you are unsure about. Do not pad or validate.
- Ask before: adding a production dependency, changing lockfiles, touching CI/infra config, deleting files, or force-pushing.

## Definition of done
- Type-check, lint, and the relevant tests pass before you report done. Show the command and its result.
- Never bypass hooks or checks (`--no-verify`, `// @ts-ignore`, disabling a lint rule) to make something pass. Fix the cause or ask.
- Do not touch unrelated code. No drive-by refactors, no reformatting outside the diff.

## Stack defaults (override per project)
- TypeScript strict; no `any`, no non-null assertions without a comment saying why.
- React 19 + Tailwind 4 + shadcn/ui. Reuse existing components and tokens before writing new ones. Tailwind v4 CSS-first config (`@theme`), not `tailwind.config.js`.
- pnpm unless the repo has a different lockfile.
- Go: standard library first, `errors.Is/As`, wrap with context. Rust: `Result` + `thiserror`, no `unwrap()` outside tests.

## Library docs
- For any library/framework question, resolve current docs via Context7 before answering from memory. Say which version you checked.

## Git
- Conventional Commits. Small, scoped commits. Never commit secrets, `.env`, or credentials.

<!-- Maintainer notes (stripped by Claude Code, ignored by Codex): review this file quarterly; anything project-specific goes into the repo's AGENTS.md/CLAUDE.md. -->
