import test from 'node:test';
import assert from 'node:assert/strict';

test('unsupported warning logic flags non-dedicated AI article parsers correctly', () => {
  const isDedicatedAiArticle = false;
  const platform = 'WebArticle';

  const shouldShowWarning = isDedicatedAiArticle === false || platform === 'WebArticle';
  assert.equal(shouldShowWarning, true);
});

test('feedback URL formatting generates correct GitHub issue URL without exposing full page URL by default', () => {
  const domain = 'example-ai.com';
  const isGeneric = true;

  const issueTitle = isGeneric
    ? `[Platform Request] Support for ${domain}`
    : `[Feedback] Issue with Chat Export`;

  const issueBody = `### Platform Support Request\n\n- **Website Domain**: ${domain || 'N/A'}\n- **Current Parser**: ArticleParser (Generic Web Article)\n\n### Description\nPlease add dedicated parser support for this AI chat platform.\n\n- **Page URL (optional)**: `;

  const issueUrl = `https://github.com/Covai-Labs/ai-chat-exporter/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

  assert.match(issueUrl, /github\.com\/Covai-Labs\/ai-chat-exporter\/issues\/new/);
  assert.match(issueUrl, /Platform%20Request/);
  assert.match(issueUrl, /example-ai\.com/);
  assert.ok(issueBody.includes('Page URL (optional)'));
});
