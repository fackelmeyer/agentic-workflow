// Pure rule logic for the guard hook. No I/O here, so every rule is unit-tested.
//
// Each check returns a list of findings: { decision: 'deny' | 'ask', reason }.
// 'deny' blocks the tool call; 'ask' hands the decision to the human.
// The rules mirror config/AGENTS.md. They are pattern-based guardrails,
// not a sandbox: see "Known limits" in the README.

/** Comments and directives that switch a check off instead of fixing the cause. */
const SUPPRESSIONS = [
  { pattern: /@ts-ignore\b/g, label: '@ts-ignore' },
  { pattern: /@ts-nocheck\b/g, label: '@ts-nocheck' },
  { pattern: /@ts-expect-error\b/g, label: '@ts-expect-error' },
  { pattern: /eslint-disable(?:-next-line|-line)?\b/g, label: 'eslint-disable' },
  { pattern: /biome-ignore\b/g, label: 'biome-ignore' },
  { pattern: /#\s*type:\s*ignore\b/g, label: '# type: ignore' },
  { pattern: /#\s*noqa\b/g, label: '# noqa' },
  { pattern: /\/\/\s*nolint\b/g, label: '//nolint' },
  { pattern: /#!\[allow\(/g, label: '#![allow(...)]' },
];

/** High-confidence secret formats. The reason never echoes the match. */
const SECRETS = [
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, label: 'a private key' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, label: 'an AWS access key' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, label: 'a GitHub token' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/, label: 'a GitHub token' },
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/, label: 'an Anthropic API key' },
  { pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/, label: 'an OpenAI API key' },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, label: 'a Slack token' },
  { pattern: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/, label: 'a Stripe live key' },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/, label: 'a Google API key' },
];

const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'Cargo.lock',
  'go.sum',
  'poetry.lock',
  'uv.lock',
  'Pipfile.lock',
  'Gemfile.lock',
  'composer.lock',
  'pubspec.lock',
]);

/** Paths that are CI or infrastructure configuration. */
const INFRA = [
  /(^|\/)\.github\/workflows\//,
  /(^|\/)\.gitlab-ci\.ya?ml$/,
  /(^|\/)\.circleci\//,
  /(^|\/)azure-pipelines\.ya?ml$/,
  /(^|\/)Jenkinsfile$/,
  /(^|\/)(Dockerfile|Containerfile)(\.[\w.-]+)?$/,
  /(^|\/)(docker-)?compose(\.[\w.-]+)?\.ya?ml$/,
  /\.tf(vars)?$/,
  /(^|\/)(k8s|kubernetes|helm|charts|infra|terraform)\//,
  /(^|\/)(wrangler|fly|vercel|netlify)\.(toml|json|jsonc)$/,
];

/** .env files hold secrets; examples and templates are fine. */
const ENV_FILE = /(^|\/)\.env(\.[\w-]+)?$/;
const ENV_TEMPLATE = /(^|\/)\.env\.(example|sample|template|dist)$/;

function basename(path) {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}

function normalise(path) {
  return path.replace(/\\/g, '/');
}

function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

// ---------------------------------------------------------------------------
// Files (Write, Edit, MultiEdit)

/**
 * @param {object} input
 * @param {string} input.path absolute file path
 * @param {string} input.before text the change removes (old_string, or the
 *   current file content for Write)
 * @param {string} input.after text the change adds (new_string or content)
 */
export function checkFileChange({ path, before, after }) {
  const findings = [];
  const file = normalise(path);
  const name = basename(file);

  if (ENV_FILE.test(file) && !ENV_TEMPLATE.test(file)) {
    findings.push({
      decision: 'deny',
      reason: `${name} holds secrets. They live only in environment variables the user manages; the agent does not write them. Use a .env.example with placeholder values instead.`,
    });
  }

  for (const secret of SECRETS) {
    if (secret.pattern.test(after) && !secret.pattern.test(before)) {
      findings.push({
        decision: 'deny',
        reason: `The change adds what looks like ${secret.label}. Secrets never go into code or the repo; read them from an environment variable.`,
      });
    }
  }

  const added = SUPPRESSIONS.filter(
    (rule) => count(after, rule.pattern) > count(before, rule.pattern),
  ).map((rule) => rule.label);
  if (added.length > 0) {
    findings.push({
      decision: 'deny',
      reason: `The change adds ${added.join(', ')}. Checks are not switched off to make something pass: fix the cause, or ask the user.`,
    });
  }

  if (LOCKFILES.has(name)) {
    findings.push({
      decision: 'ask',
      reason: `${name} is a lockfile. Lockfile changes need the user's approval.`,
    });
  }

  if (INFRA.some((pattern) => pattern.test(file))) {
    findings.push({
      decision: 'ask',
      reason: `${name} is CI or infrastructure configuration. Changes need the user's approval.`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Shell commands (Bash)

/**
 * Removes heredoc bodies and quoted strings, so a commit message that
 * mentions "--no-verify" is not read as the flag itself.
 */
export function stripQuoted(command) {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, ' ')
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/** Splits a command line into simple commands at ;, &&, ||, | and newlines. */
export function segments(command) {
  return stripQuoted(command)
    .split(/;|&&|\|\||\||\n/)
    .map((part) => part.trim().replace(/^(?:sudo|command|exec|time)\s+/, ''))
    .filter(Boolean);
}

const DEV_FLAGS = /(?:^|\s)(?:-D|--save-dev|--dev|-d|--group[= ]dev|-G\s+dev|--optional|--save-optional)(?:\s|$)/;

function addsProductionDependency(segment) {
  const rules = [
    // npm install <pkg> adds a dependency; npm install / npm ci alone do not.
    /^npm\s+(?:install|i|add|isntall)\s+(?!-)\S/,
    /^pnpm\s+(?:add|install|i)\s+(?!-)\S/,
    /^yarn\s+add\s+/,
    /^bun\s+add\s+/,
    /^(?:uv|poetry|cargo)\s+add\s+/,
    /^pip3?\s+install\s+(?!-r\b|-e\s+\.)(?!-)\S/,
    /^go\s+get\s+/,
  ];
  return rules.some((rule) => rule.test(segment)) && !DEV_FLAGS.test(segment);
}

function isGit(segment, sub) {
  return new RegExp(`^git(?:\\s+-C\\s+\\S+)?\\s+${sub}\\b`).test(segment);
}

export function checkCommand(command) {
  const findings = [];
  for (const segment of segments(command)) {
    const commit = isGit(segment, 'commit');
    const push = isGit(segment, 'push');

    // `git commit -n` means --no-verify; `git push -n` means --dry-run.
    const noVerify =
      /(?:^|\s)--no-verify(?:\s|$)/.test(segment) ||
      (commit && /(?:^|\s)-[a-zA-Z]*n[a-zA-Z]*(?:\s|$)/.test(segment));
    if ((commit || push) && noVerify) {
      findings.push({
        decision: 'deny',
        reason: 'Git hooks are not bypassed with --no-verify. Fix what the hook reports, or ask the user.',
      });
    }

    const force =
      /(?:^|\s)(?:--force(?:-with-lease)?(?:=\S+)?|-[a-zA-Z]*f[a-zA-Z]*)(?:\s|$)/.test(segment) ||
      /\s\+[\w./-]/.test(segment);
    if (push && force) {
      findings.push({ decision: 'ask', reason: 'Force-push rewrites shared history and needs the user’s approval.' });
    } else if (push) {
      findings.push({ decision: 'ask', reason: 'Pushes happen only when the user says so.' });
    }

    if (commit) {
      findings.push({ decision: 'ask', reason: 'Commits happen only when the user says so.' });
    }

    if (/^(?:rm|rmdir|unlink|shred)\s/.test(segment) || isGit(segment, 'rm') || (isGit(segment, 'clean') && /\s-[a-zA-Z]*f/.test(segment)) || /^find\s.*\s-delete\b/.test(segment)) {
      findings.push({ decision: 'ask', reason: 'Deleting files needs the user’s approval.' });
    }

    if (addsProductionDependency(segment)) {
      findings.push({
        decision: 'ask',
        reason: 'Adding a production dependency needs the user’s approval (dev dependencies are fine).',
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------

/** Combines findings into one hook decision: deny wins over ask. */
export function decide(findings) {
  if (findings.length === 0) return null;
  const deny = findings.filter((f) => f.decision === 'deny');
  const chosen = deny.length > 0 ? deny : findings;
  const reasons = [...new Set(chosen.map((f) => f.reason))];
  return {
    decision: deny.length > 0 ? 'deny' : 'ask',
    reason: `agentic-workflow guard: ${reasons.join(' ')}`,
  };
}
