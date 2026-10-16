# Process

Coding agents give me speed. Responsibility for every line stays with me, so every change goes through the same steps. The written rules are in [`config/AGENTS.md`](../config/AGENTS.md) and [`config/CLAUDE.md`](../config/CLAUDE.md); this page explains the order and the reasons.

## 1. Specification and plan first

Before an agent writes code, it is settled what gets built and how I will judge the result. For a feature that touches several files: brainstorm the intent, write a plan, then implement test-first. A one-file fix skips the ceremony.

*Why:* an agent fills every gap in a request with a plausible guess. A plan moves those guesses to a point where they are cheap to correct.

## 2. Project rules, not prompt luck

Every project has a `CLAUDE.md` (see the [template](../templates/CLAUDE.md)) with its commands, conventions and limits. Global rules live in `AGENTS.md`, which Claude Code and Codex both read.

*Why:* a rule that lives in a prompt is gone in the next session. A rule in a file applies every time.

## 3. Small diffs, every one read

Changes stay small and scoped, one concern per commit (Conventional Commits). I do not accept code I have not read and could not explain in an interview.

*Why:* a large diff gets skimmed. Skimmed code is where the plausible-but-wrong parts survive.

## 4. Tests as a gate

Type check, lint and the relevant tests pass before a change counts as done, and the result is shown, not claimed. UI work additionally gets a browser check and an accessibility pass. Checks are never switched off to get to green; the [guard](../hooks/rules.mjs) blocks the usual shortcuts.

*Why:* "it should work" is the most common false statement an agent makes. A command and its output are evidence.

## 5. Security review as its own step

Authentication, injection and secrets are checked separately, not in passing during the normal review. Health data, customer data and secrets never go to an AI tool; secrets live only in environment variables.

*Why:* security bugs rarely look wrong in a diff. They need a reviewer who is looking for them.

## Limits on the agent

The agent asks before it adds a production dependency, changes lockfiles, touches CI or infrastructure, deletes files or force-pushes. Commits and pushes happen only when I say so. The guard enforces these as `ask` decisions.
