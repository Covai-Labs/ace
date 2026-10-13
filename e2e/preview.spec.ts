import { test, expect } from './fixtures';

const MOCK_CONVERSATION = {
  platform: 'ChatGPT',
  title: 'Quantum Mechanics Notes',
  url: 'https://chatgpt.com/c/test-chat',
  createdAt: '2026-10-12T10:00:00.000Z',
  messages: [
    {
      role: 'User',
      content: 'Explain Schrödinger equation and show a Python formula.',
    },
    {
      role: 'ChatGPT',
      content:
        'The time-dependent Schrödinger equation is:\n\n$$i\\hbar\\frac{\\partial}{\\partial t}\\Psi(r,t) = \\hat{H}\\Psi(r,t)$$\n\nHere is a Python example:\n\n```python\nimport numpy as np\ndef wave_packet(x):\n    return np.exp(-x**2)\n```',
    },
  ],
};

test.describe('Preview Workspace', () => {
  test('loads conversation data and switches format tabs', async ({
    openExtensionPage,
    setStorage,
  }) => {
    // Seed storage with conversation
    await setStorage('local', {
      previewTitle: 'Quantum Mechanics Notes',
      previewFilename: 'ChatGPT - Quantum Mechanics Notes - 2026-10-12',
      previewConversation: MOCK_CONVERSATION,
    });

    const page = await openExtensionPage('preview.html');

    // Filename input should reflect seeded title/filename
    const filenameInput = page.locator('#preview-filename-input');
    await expect(filenameInput).toHaveValue(/Quantum Mechanics/);

    // Default view shows HTML live tab or Markdown
    const markdownTab = page.locator('[data-tab="markdown"]');
    await expect(markdownTab).toBeVisible();

    // Click Markdown tab
    await markdownTab.click();
    await expect(markdownTab).toHaveClass(/active/);

    // Verify rendered code contains markdown content
    const codeEl = page.locator('#preview-code');
    await expect(codeEl).toBeVisible();
    await expect(codeEl).toContainText('Quantum Mechanics');
    await expect(codeEl).toContainText('Schrödinger');

    // Click JSON tab
    const jsonTab = page.locator('[data-tab="json"]');
    await jsonTab.click();
    await expect(jsonTab).toHaveClass(/active/);
    await expect(codeEl).toContainText('"title": "Quantum Mechanics Notes"');
    await expect(codeEl).toContainText('"schemaVersion": 1');

    // Click Plain Text tab
    const textTab = page.locator('[data-tab="text"]');
    await textTab.click();
    await expect(textTab).toHaveClass(/active/);
    await expect(codeEl).toContainText('Prompt:');
    await expect(codeEl).toContainText('Response:');
  });

  test('HTML live render activates iframe and displays math & code', async ({
    openExtensionPage,
    setStorage,
  }) => {
    await setStorage('local', {
      previewTitle: 'Quantum Mechanics Notes',
      previewFilename: 'ChatGPT - Quantum Mechanics Notes - 2026-10-12',
      previewConversation: MOCK_CONVERSATION,
    });

    const page = await openExtensionPage('preview.html');

    // Click HTML Live tab
    const htmlLiveTab = page.locator('[data-tab="html-render"]');
    await htmlLiveTab.click();
    await expect(htmlLiveTab).toHaveClass(/active/);

    // Render wrapper and iframe should be visible
    const renderWrapper = page.locator('#render-wrapper');
    await expect(renderWrapper).toBeVisible();

    const iframe = page.frameLocator('#preview-rendered');
    // Inside the rendered HTML, KaTeX and code blocks should be rendered
    const mathOrCode = iframe.locator('.katex, pre, code');
    await expect(mathOrCode.first()).toBeVisible({ timeout: 10000 });
  });
});
