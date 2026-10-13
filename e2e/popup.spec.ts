import { test, expect } from './fixtures';

test.describe('Popup View', () => {
  test('renders header, action buttons, and detection status', async ({ openExtensionPage }) => {
    const page = await openExtensionPage('popup.html');

    // Header actions
    await expect(page.locator('#reparse-btn')).toBeVisible();
    await expect(page.locator('#support-btn')).toBeVisible();
    await expect(page.locator('#open-options-btn')).toBeVisible();

    // Status indicator
    const status = page.locator('#status');
    await expect(status).toBeVisible();

    // Verify format dropdown options exist in DOM
    const formatSelect = page.locator('#format-select');
    await expect(formatSelect).toBeAttached();
    const options = await formatSelect.locator('option').allInnerTexts();
    expect(options.some((opt) => opt.includes('Markdown'))).toBe(true);
    expect(options.some((opt) => opt.includes('JSON'))).toBe(true);
    expect(options.some((opt) => opt.includes('HTML'))).toBe(true);
    expect(options.some((opt) => opt.includes('PDF'))).toBe(true);
  });

  test('clicking options button opens options page or triggers openOptions', async ({
    openExtensionPage,
    context,
  }) => {
    const page = await openExtensionPage('popup.html');
    const optionsBtn = page.locator('#open-options-btn');
    await expect(optionsBtn).toBeVisible();

    const optionsPagePromise = context.waitForEvent('page', {
      predicate: (p) => p.url().includes('options.html'),
      timeout: 5000,
    });
    await optionsBtn.click();
    const optionsPage = await optionsPagePromise;
    await expect(optionsPage).toHaveURL(/options\.html/);
  });
});
