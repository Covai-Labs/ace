import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SECRET_PATTERNS = [
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'OpenAI API Key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g },
  { name: 'Anthropic API Key', regex: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g },
  {
    name: 'GitHub Personal Access Token',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g,
  },
  {
    name: 'GitHub Fine-Grained PAT',
    regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
  },
  {
    name: 'AWS Access Key ID',
    regex: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    name: 'AWS Secret Access Key',
    regex:
      /(?:aws_secret_access_key|aws_secret_key|secret_access_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
  },
];

// Substrings that mark a key as intentionally synthetic/dummy for testing.
// Note: Generic short words ("test", "fake") are excluded to prevent accidental false negatives.
const ALLOWED_DUMMY_INDICATORS = [
  'dummy',
  'fixture',
  'placeholder',
  'example',
  'redacted',
  '00000000',
  '11111111',
];

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.tar',
  '.gz',
]);

const isStagedMode = process.env.CHECK_STAGED === '1' || process.argv.includes('--staged');

test('repository contains no un-sanitized secrets or live credentials', () => {
  const targetFiles = isStagedMode
    ? execSync('git diff --cached --name-only --diff-filter=ACM', {
        encoding: 'utf8',
      })
        .split('\n')
        .filter(Boolean)
    : execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);

  const violations = [];

  for (const relPath of targetFiles) {
    const ext = path.extname(relPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;

    let content;
    try {
      if (isStagedMode) {
        // Read directly from git index (staged blob) to catch staged secrets
        content = execSync(`git show :${JSON.stringify(relPath)}`, {
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
        });
      } else {
        content = fs.readFileSync(relPath, 'utf8');
      }
    } catch {
      continue;
    }

    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const matchedSecret = match[1] || match[0];
        const lower = matchedSecret.toLowerCase();
        const isDummy = ALLOWED_DUMMY_INDICATORS.some((indicator) => lower.includes(indicator));

        if (!isDummy) {
          violations.push({
            file: relPath,
            rule: pattern.name,
            secretSnippet: `${matchedSecret.slice(0, 8)}... (len: ${matchedSecret.length})`,
          });
        }
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `Found un-sanitized secrets in ${isStagedMode ? 'staged' : 'tracked'} files:\n${violations
      .map((v) => `  - [${v.rule}] in ${v.file}: ${v.secretSnippet}`)
      .join('\n')}\n` +
      `If this is a test fixture or mock, please replace it with a dummy placeholder ` +
      `containing "dummy", "fixture", "placeholder", "example", "redacted", or "00000000".`,
  );
});
