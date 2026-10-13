import { test, expect } from './fixtures';

test.describe('Options Page', () => {
  test('renders options navigation and core settings sections', async ({ openExtensionPage }) => {
    const page = await openExtensionPage('options.html');

    // Sidebar navigation
    await expect(page.locator('#options-nav')).toBeVisible();
    await expect(page.locator('#nav-appearance')).toBeVisible();
    await expect(page.locator('#nav-language')).toBeVisible();
    await expect(page.locator('#nav-export')).toBeVisible();
    await expect(page.locator('#nav-extraction')).toBeVisible();

    // Appearance section
    await expect(page.locator('#theme-select')).toBeVisible();

    // Export defaults section
    await expect(page.locator('#default-format-select')).toBeVisible();
    await expect(page.locator('#default-include-images')).toBeAttached();
    await expect(page.locator('#default-include-attachments')).toBeAttached();
  });

  test('updates theme setting and persists to storage', async ({
    openExtensionPage,
    serviceWorker,
  }) => {
    const page = await openExtensionPage('options.html');

    const themeSelect = page.locator('#theme-select');
    await expect(themeSelect).toBeVisible();

    // Change theme to dark
    await themeSelect.selectOption('dark');

    // Verify storage was updated without race condition
    await expect
      .poll(
        () =>
          serviceWorker.evaluate(
            () =>
              new Promise<string>((resolve) =>
                chrome.storage.sync.get('theme', (res) => resolve(res.theme)),
              ),
          ),
        { timeout: 5000 },
      )
      .toBe('dark');
  });

  test('updates default export format setting and persists to storage', async ({
    openExtensionPage,
    serviceWorker,
  }) => {
    const page = await openExtensionPage('options.html');

    const formatSelect = page.locator('#default-format-select');
    await expect(formatSelect).toBeVisible();

    // Change format to json
    await formatSelect.selectOption('json');

    // Verify storage was updated without race condition
    await expect
      .poll(
        () =>
          serviceWorker.evaluate(
            () =>
              new Promise<string>((resolve) =>
                chrome.storage.sync.get('defaultFormat', (res) => resolve(res.defaultFormat)),
              ),
          ),
        { timeout: 5000 },
      )
      .toBe('json');
  });
});
