import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkCommand, checkFileChange, decide, segments } from '../hooks/rules.mjs';

const decisionFor = (command) => decide(checkCommand(command))?.decision ?? null;
const fileDecision = (change) => decide(checkFileChange(change))?.decision ?? null;

describe('shell commands', () => {
  describe('--no-verify is denied', () => {
    for (const command of [
      'git commit --no-verify -m "wip"',
      'git commit -n -m "wip"',
      'git commit -anm "wip"',
      'git push --no-verify',
      'cd app && git commit --no-verify -m x',
      'git -C ../other commit --no-verify -m x',
    ]) {
      test(command, () => assert.equal(decisionFor(command), 'deny'));
    }
  });

  describe('talking about --no-verify is not using it', () => {
    for (const command of [
      'git commit -m "docs: never use --no-verify"',
      "git commit -m 'explain -n flag'",
      'git commit -F - <<\'EOF\'\nfix: stop agents from using --no-verify\nEOF',
      'grep -- --no-verify README.md',
    ]) {
      test(command, () => assert.notEqual(decisionFor(command), 'deny'));
    }
  });

  test('git push -n is a dry run, not --no-verify', () => {
    assert.equal(decisionFor('git push -n origin main'), 'ask');
  });

  describe('commits and pushes need approval', () => {
    for (const command of ['git commit -m "feat: x"', 'git push', 'git push -u origin feature']) {
      test(command, () => assert.equal(decisionFor(command), 'ask'));
    }
  });

  describe('force-push needs approval and says why', () => {
    for (const command of [
      'git push --force',
      'git push -f origin main',
      'git push --force-with-lease',
      'git push origin +main',
    ]) {
      test(command, () => {
        const result = decide(checkCommand(command));
        assert.equal(result?.decision, 'ask');
        assert.match(result?.reason ?? '', /Force-push/);
      });
    }
  });

  describe('deleting files needs approval', () => {
    for (const command of ['rm -rf dist', 'rm notes.md', 'git rm old.ts', 'git clean -fd', 'find . -name "*.log" -delete']) {
      test(command, () => assert.equal(decisionFor(command), 'ask'));
    }
  });

  describe('production dependencies need approval', () => {
    for (const command of [
      'npm install zod',
      'npm i zod',
      'pnpm add zod',
      'yarn add zod',
      'bun add zod',
      'uv add httpx',
      'cargo add serde',
      'pip install requests',
      'go get github.com/x/y',
    ]) {
      test(command, () => assert.equal(decisionFor(command), 'ask'));
    }
  });

  describe('dev dependencies and installs from the lockfile pass', () => {
    for (const command of [
      'npm install',
      'npm ci',
      'npm install -D vitest',
      'pnpm add -D vitest',
      'pnpm install',
      'pnpm i',
      'yarn add --dev vitest',
      'uv add --dev pytest',
      'cargo add --dev insta',
      'pip install -r requirements.txt',
      'pip install -e .',
    ]) {
      test(command, () => assert.equal(decisionFor(command), null));
    }
  });

  describe('ordinary commands pass', () => {
    for (const command of ['pnpm test', 'git status', 'git diff --stat', 'ls -la', 'echo "rm -rf /"', 'git log --oneline -5']) {
      test(command, () => assert.equal(decisionFor(command), null));
    }
  });

  test('segments split chained commands and ignore quoted separators', () => {
    assert.deepEqual(segments('pnpm build && git commit -m "a && b"; ls'), ['pnpm build', 'git commit -m ""', 'ls']);
  });
});

describe('file changes', () => {
  describe('switching checks off is denied', () => {
    for (const after of [
      '// @ts-ignore\nconst x: number = "a";',
      '/* eslint-disable */',
      '// eslint-disable-next-line no-console',
      'x = 1  # type: ignore',
      'import os  # noqa',
      '// biome-ignore lint: reason',
    ]) {
      test(after.split('\n')[0] ?? after, () => assert.equal(fileDecision({ path: '/p/src/a.ts', before: '', after }), 'deny'));
    }
  });

  test('editing next to an existing suppression is not a new suppression', () => {
    const line = '// @ts-ignore legacy\nconst a = 1;';
    assert.equal(fileDecision({ path: '/p/src/a.ts', before: line, after: `${line}\nconst b = 2;` }), null);
  });

  describe('secrets are denied, and the reason does not repeat them', () => {
    const fakeOpenAi = `sk-${'a'.repeat(40)}`;
    for (const after of [
      `const key = "AKIA${'A'.repeat(16)}";`,
      `token: ghp_${'a'.repeat(36)}`,
      `ANTHROPIC_API_KEY=sk-ant-${'a'.repeat(30)}`,
      `apiKey: "${fakeOpenAi}"`,
      '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
    ]) {
      test(after.slice(0, 30), () => {
        const result = decide(checkFileChange({ path: '/p/src/config.ts', before: '', after }));
        assert.equal(result?.decision, 'deny');
        assert.ok(!result?.reason.includes('a'.repeat(16)), 'reason must not echo the secret');
      });
    }
  });

  describe('.env files are denied, templates are fine', () => {
    for (const path of ['/p/.env', '/p/.env.local', '/p/apps/web/.env.production']) {
      test(path, () => assert.equal(fileDecision({ path, before: '', after: 'X=1' }), 'deny'));
    }
    for (const path of ['/p/.env.example', '/p/.env.sample', '/p/src/env.ts']) {
      test(path, () => assert.equal(fileDecision({ path, before: '', after: 'X=' }), null));
    }
  });

  describe('lockfiles need approval', () => {
    for (const path of ['/p/pnpm-lock.yaml', '/p/package-lock.json', '/p/Cargo.lock', '/p/go.sum']) {
      test(path, () => assert.equal(fileDecision({ path, before: 'a', after: 'b' }), 'ask'));
    }
  });

  describe('CI and infrastructure need approval', () => {
    for (const path of [
      '/p/.github/workflows/ci.yml',
      '/p/Dockerfile',
      '/p/Dockerfile.dev',
      '/p/docker-compose.yml',
      '/p/compose.prod.yaml',
      '/p/infra/main.tf',
      '/p/wrangler.toml',
    ]) {
      test(path, () => assert.equal(fileDecision({ path, before: '', after: 'x' }), 'ask'));
    }
  });

  test('ordinary source files pass', () => {
    assert.equal(fileDecision({ path: '/p/src/app.ts', before: 'a', after: 'export const a = 1;' }), null);
  });
});

describe('decide', () => {
  test('deny wins over ask and only deny reasons are shown', () => {
    const result = decide([
      { decision: 'ask', reason: 'ask reason' },
      { decision: 'deny', reason: 'deny reason' },
    ]);
    assert.equal(result?.decision, 'deny');
    assert.ok(result?.reason.includes('deny reason'));
    assert.ok(!result?.reason.includes('ask reason'));
  });

  test('no findings, no decision', () => {
    assert.equal(decide([]), null);
  });
});
