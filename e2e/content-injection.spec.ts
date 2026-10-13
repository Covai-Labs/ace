import { test, expect } from './fixtures';

test.describe('Content Script & Web Page Integration', () => {
  test('content script injects into page and responds to extension messages', async ({
    context,
    serviceWorker,
  }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:3333/fixtures/chatgpt-chat.html');
    await page.waitForLoadState('domcontentloaded');

    // Verify content script injection by messaging the tab from the service worker
    await expect
      .poll(
        () =>
          serviceWorker.evaluate(async () => {
            const [tab] = await chrome.tabs.query({
              url: 'http://localhost:3333/*',
            });
            if (!tab || !tab.id) return false;
            try {
              const res = await chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_CACHE' });
              return res?.success === true;
            } catch {
              return false;
            }
          }),
        { timeout: 10000 },
      )
      .toBe(true);
  });
});
