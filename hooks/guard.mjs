#!/usr/bin/env node
// PreToolUse hook: enforces the rules in config/AGENTS.md before a tool runs.
// Reads the hook event from stdin and prints a permission decision as JSON.
// Prints nothing when no rule applies, so the normal permission flow continues.
//
// Fails open: if the input cannot be read, the hook exits 1 (a non-blocking
// error in Claude Code) rather than blocking all work. See README, "Known limits".

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkCommand, checkFileChange, decide } from './rules.mjs';

function readStdin() {
  return readFileSync(0, 'utf8');
}

function currentContent(path) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  } catch {
    return '';
  }
}

export function evaluate(event) {
  const { tool_name: tool, tool_input: input = {} } = event;
  switch (tool) {
    case 'Bash':
      return decide(checkCommand(String(input.command ?? '')));
    case 'Write':
      return decide(
        checkFileChange({
          path: String(input.file_path ?? ''),
          before: currentContent(String(input.file_path ?? '')),
          after: String(input.content ?? ''),
        }),
      );
    case 'Edit':
      return decide(
        checkFileChange({
          path: String(input.file_path ?? ''),
          before: String(input.old_string ?? ''),
          after: String(input.new_string ?? ''),
        }),
      );
    case 'MultiEdit': {
      const edits = Array.isArray(input.edits) ? input.edits : [];
      return decide(
        checkFileChange({
          path: String(input.file_path ?? ''),
          before: edits.map((e) => String(e.old_string ?? '')).join('\n'),
          after: edits.map((e) => String(e.new_string ?? '')).join('\n'),
        }),
      );
    }
    default:
      return null;
  }
}

function main() {
  let event;
  try {
    event = JSON.parse(readStdin());
  } catch (error) {
    process.stderr.write(`agentic-workflow guard: cannot read hook input (${error.message})\n`);
    process.exit(1);
  }

  const result = evaluate(event);
  if (result) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: result.decision,
          permissionDecisionReason: result.reason,
        },
      }),
    );
  }
  process.exit(0);
}

// Run only when executed directly, not when imported by the tests. Compare
// real file paths, not URLs: plugin paths can contain spaces and symlinks
// (on macOS, /var is a symlink to /private/var).
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isEntryPoint()) main();
