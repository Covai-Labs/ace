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

test('feedback URL formatting generates correct GitHub issue URL without exposing full page URL by default', () => {
  const domain = 'example-ai.com';
  const isGeneric = true;

  const issueTitle = isGeneric
    ? `[Platform Request] Support for ${domain}`
    : `[Feedback] Issue with Chat Export`;

  const issueBody = `### Platform Support Request\n\n- **Website Domain**: ${domain || 'N/A'}\n- **Current Parser**: ArticleParser (Generic Web Article)\n\n### Description\nPlease add dedicated parser support for this AI chat platform.\n\n- **Page URL (optional)**: `;

  const issueUrl = `https://github.com/Covai-Labs/ai-chat-exporter/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

  const parsed = new URL(issueUrl);
  assert.equal(parsed.origin, 'https://github.com');
  assert.equal(parsed.pathname, '/Covai-Labs/ai-chat-exporter/issues/new');
  assert.equal(parsed.searchParams.get('title'), '[Platform Request] Support for example-ai.com');
  assert.ok(parsed.searchParams.get('body').includes('Page URL (optional)'));
});
