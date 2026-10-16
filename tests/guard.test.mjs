import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

// Runs the hook the way Claude Code does: as a process, event on stdin.
const root = join(import.meta.dirname, '..');

function run(script, event) {
  const result = spawnSync(process.execPath, [script], { input: event, encoding: 'utf8' });
  return {
    status: result.status,
    output: result.stdout ? JSON.parse(result.stdout) : null,
    stderr: result.stderr,
  };
}

describe('guard process', () => {
  const script = join(root, 'hooks', 'guard.mjs');

  test('denies with the PreToolUse output shape', () => {
    const { status, output } = run(
      script,
      JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit --no-verify -m x' } }),
    );
    assert.equal(status, 0);
    assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /--no-verify/);
  });

  test('prints nothing when no rule applies', () => {
    const { status, output } = run(script, JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'pnpm test' } }));
    assert.equal(status, 0);
    assert.equal(output, null);
  });

  test('ignores tools it does not guard', () => {
    const { output } = run(script, JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/p/.env' } }));
    assert.equal(output, null);
  });

  test('fails open with exit 1 on unreadable input', () => {
    const { status, output, stderr } = run(script, 'not json');
    assert.equal(status, 1);
    assert.equal(output, null);
    assert.match(stderr, /cannot read hook input/);
  });

  describe('when installed under a path with spaces', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentic workflow '));
    cpSync(join(root, 'hooks'), join(dir, 'hooks'), { recursive: true });
    after(() => rmSync(dir, { recursive: true, force: true }));

    test('still runs', () => {
      const { output } = run(
        join(dir, 'hooks', 'guard.mjs'),
        JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: '/p/a.ts', old_string: 'a', new_string: '// @ts-ignore\na' } }),
      );
      assert.equal(output?.hookSpecificOutput.permissionDecision, 'deny');
    });
  });
});

describe('plugin wiring', () => {
  test('hooks.json runs the guard before Bash, Write, Edit and MultiEdit', () => {
    const config = JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8'));
    const [entry] = config.hooks.PreToolUse;
    assert.deepEqual(entry.matcher.split('|').sort(), ['Bash', 'Edit', 'MultiEdit', 'Write']);
    assert.deepEqual(entry.hooks[0].args, ['${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs']);
  });
});
