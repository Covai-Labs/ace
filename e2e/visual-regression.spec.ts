import { test, expect } from './fixtures';

const VISUAL_MOCK_CONVERSATION = {
  platform: 'Claude',
  title: 'Visual Regression Test Case',
  url: 'https://claude.ai/chat/visual-test',
  createdAt: '2026-10-12T12:00:00.000Z',
  messages: [
    {
      role: 'User',
      content: 'Compute the Gaussian integral and write a short script.',
    },
    {
      role: 'Assistant',
      content:
        'The Gaussian integral evaluates as:\n\n$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$\n\nHere is a simple computation in Python:\n\n```python\nimport math\nprint(math.sqrt(math.pi))\n```',
    },
  ],
};

test.describe('Visual Regression', () => {
  test('header toolbar visual snapshot', async ({ openExtensionPage, setStorage }) => {
    await setStorage('local', {
      previewTitle: 'Visual Regression Test Case',
      previewFilename: 'Claude - Visual Regression Test Case',
      previewConversation: VISUAL_MOCK_CONVERSATION,
    });

    const page = await openExtensionPage('preview.html');

    // Wait for the toolbar and controls to settle
    const headerToolbar = page.locator('.header-toolbar');
    await expect(headerToolbar).toBeVisible();

    // Verify visual stability of the toolbar
    await expect(headerToolbar).toHaveScreenshot('preview-header-toolbar.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('rendered math and code card visual snapshot', async ({ openExtensionPage, setStorage }) => {
    await setStorage('local', {
      previewTitle: 'Visual Regression Test Case',
      previewFilename: 'Claude - Visual Regression Test Case',
      previewConversation: VISUAL_MOCK_CONVERSATION,
    });

    const page = await openExtensionPage('preview.html');

    const htmlLiveTab = page.locator('[data-tab="html-render"]');
    await htmlLiveTab.click();

    const iframe = page.frameLocator('#preview-rendered');
    const messageCard = iframe.locator('.message-card').last();
    await expect(messageCard).toBeVisible({ timeout: 10000 });

    // Lock dimensions across environments to eliminate headless subpixel/scrollbar width variances
    await messageCard.evaluate((el) => {
      el.style.width = '496px';
      el.style.boxSizing = 'border-box';
    });

    // Snapshot the message card containing the KaTeX formula and code block
    await expect(messageCard).toHaveScreenshot('rendered-math-card.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});
