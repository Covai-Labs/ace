import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowUnsupportedWarning } from '../content/utils/feedback.js';

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

test('feedback URL formatting generates correct GitHub issue URL for platform requests', () => {
  const domain = 'example-ai.com';
  const pageUrl = 'https://example-ai.com/chat/123';
  const cleanUrl = pageUrl.startsWith('http') ? pageUrl : '';
  const issueTitle = `platform: Support for ${domain || 'New AI Platform'}`;
  const issueUrl = `https://github.com/Covai-Labs/ai-chat-exporter/issues/new?template=platform_support.yml&title=${encodeURIComponent(issueTitle)}&platform=${encodeURIComponent(domain)}&url=${encodeURIComponent(cleanUrl)}`;

  const parsed = new URL(issueUrl);
  assert.equal(parsed.origin, 'https://github.com');
  assert.equal(parsed.pathname, '/Covai-Labs/ai-chat-exporter/issues/new');
  assert.equal(parsed.searchParams.get('template'), 'platform_support.yml');
  assert.equal(parsed.searchParams.get('title'), 'platform: Support for example-ai.com');
  assert.equal(parsed.searchParams.get('platform'), 'example-ai.com');
  assert.equal(parsed.searchParams.get('url'), 'https://example-ai.com/chat/123');
});
