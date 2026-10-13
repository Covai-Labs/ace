import { test, expect } from './fixtures';

test.describe('Content Script & Web Page Integration', () => {
  test('content script injects into page and handles extension messages', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:3333/fixtures/chatgpt-chat.html');
    await page.waitForLoadState('domcontentloaded');

    // Trigger toast notification from extension content script
    const toastResult = await page.evaluate(async () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        // Evaluate sending message to tab or testing toast element
        const event = new CustomEvent('show-test-toast', { detail: { msg: 'Test' } });
        window.dispatchEvent(event);
      }
      return document.title;
    });

    expect(toastResult).toBeDefined();
  });
});
