import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const SECRET_PATTERNS = [
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'OpenAI API Key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g },
  { name: 'Anthropic API Key', regex: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g },
  { name: 'GitHub Personal Access Token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g },
  { name: 'GitHub Fine-Grained PAT', regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  { name: 'AWS Access Key', regex: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g },
];

// Substrings that mark a key as intentionally synthetic/dummy for testing
const ALLOWED_DUMMY_INDICATORS = [
  'dummy',
  'fixture',
  'placeholder',
  'fake',
  'example',
  'redacted',
  '00000000',
  '11111111',
  'test',
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

test('repository contains no un-sanitized secrets or live credentials', () => {
  const gitOutput = execSync('git ls-files --cached -z', { encoding: 'utf8' });
  const stagedFiles = gitOutput.split('\0').filter(Boolean);

  const violations = [];

  for (const relPath of stagedFiles) {
    if (relPath === 'tests/secrets.test.mjs') continue;
    const ext = path.extname(relPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;

    let content;
    try {
      content = execFileSync('git', ['show', `:${relPath}`], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch {
      continue;
    }

    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const matchedSecret = match[0];
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
    `Found un-sanitized secrets in tracked files:\n${violations
      .map((v) => `  - [${v.rule}] in ${v.file}: ${v.secretSnippet}`)
      .join('\n')}\n` +
      `If this is a test fixture or mock, please replace it with a dummy placeholder ` +
      `containing dummy, fixture, redacted, or 00000000.`,
  );
});

// AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6
