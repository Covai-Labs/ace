import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldShowUnsupportedWarning,
  buildPlatformSupportIssueUrl,
} from '../content/utils/feedback.js';

test('shouldShowUnsupportedWarning flags non-dedicated AI article parsers correctly', () => {
  // Available and generic fallback (not dedicated AI) -> warning shown
  assert.equal(shouldShowUnsupportedWarning({ available: true, isDedicatedAi: false }), true);

  // Available and dedicated AI parser -> no warning
  assert.equal(shouldShowUnsupportedWarning({ available: true, isDedicatedAi: true }), false);

  // Parser not available -> no warning (error state handled separately)
  assert.equal(shouldShowUnsupportedWarning({ available: false, isDedicatedAi: false }), false);
  assert.equal(shouldShowUnsupportedWarning({ available: false, isDedicatedAi: true }), false);

  // Null, undefined, or empty reports -> no warning
  assert.equal(shouldShowUnsupportedWarning(null), false);
  assert.equal(shouldShowUnsupportedWarning(undefined), false);
  assert.equal(shouldShowUnsupportedWarning({}), false);
});

test('buildPlatformSupportIssueUrl generates correct GitHub issue URL for platform requests', () => {
  const pageUrl = 'https://example-ai.com/chat/123';
  const issueUrl = buildPlatformSupportIssueUrl(pageUrl);

  const parsed = new URL(issueUrl);
  assert.equal(parsed.origin, 'https://github.com');
  assert.equal(parsed.pathname, '/Covai-Labs/ai-chat-exporter/issues/new');
  assert.equal(parsed.searchParams.get('template'), 'platform_support.yml');
  assert.equal(parsed.searchParams.get('title'), 'platform: Support for example-ai.com');
  assert.equal(parsed.searchParams.get('platform'), 'example-ai.com');
  assert.equal(parsed.searchParams.get('url'), 'https://example-ai.com/chat/123');
});

test('buildPlatformSupportIssueUrl ignores malformed or non-http URLs', () => {
  for (const invalid of ['http-not-a-url', 'javascript:alert(1)', 'not-a-url', '']) {
    const issueUrl = buildPlatformSupportIssueUrl(invalid);
    const parsed = new URL(issueUrl);
    assert.equal(parsed.searchParams.get('url'), '');
    assert.equal(parsed.searchParams.get('platform'), '');
    assert.equal(parsed.searchParams.get('title'), 'platform: Support for New AI Platform');
  }
});
