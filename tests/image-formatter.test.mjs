import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseHTML } from 'linkedom';

async function importFormatter() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-chat-exporter-'));
  await fs.mkdir(path.join(tempDir, 'content', 'formatters'), { recursive: true });
  await fs.mkdir(path.join(tempDir, 'content', 'utils'), { recursive: true });
  await fs.mkdir(path.join(tempDir, 'content', 'lib'), { recursive: true });
  await fs.symlink(path.resolve('node_modules'), path.join(tempDir, 'node_modules'), 'dir');
  await fs.writeFile(path.join(tempDir, 'package.json'), '{"type":"module"}');
  await fs.copyFile(
    path.resolve('content/formatters/base.js'),
    path.join(tempDir, 'content', 'formatters', 'base.js'),
  );
  await fs.copyFile(
    path.resolve('content/utils/sanitizer.js'),
    path.join(tempDir, 'content', 'utils', 'sanitizer.js'),
  );
  await fs.copyFile(
    path.resolve('content/lib/purify.es.js'),
    path.join(tempDir, 'content', 'lib', 'purify.es.js'),
  );
  await fs.copyFile(
    path.resolve('content/lib/assets.js'),
    path.join(tempDir, 'content', 'lib', 'assets.js'),
  );
  await fs.copyFile(
    path.resolve('content/formatters/html.js'),
    path.join(tempDir, 'content', 'formatters', 'html.js'),
  );
  await fs.copyFile(
    path.resolve('content/formatters/image.js'),
    path.join(tempDir, 'content', 'formatters', 'image.js'),
  );

  return import(path.join(tempDir, 'content', 'formatters', 'image.js'));
}

test('ImageFormatter returns correct file extension and MIME type', async () => {
  const { ImageFormatter } = await importFormatter();
  const formatter = new ImageFormatter();

  assert.equal(formatter.getFileExtension(), 'png');
  assert.equal(formatter.getMimeType(), 'image/png');
});

test('ImageFormatter creates styled screenshot container with conversation content', async () => {
  const { ImageFormatter } = await importFormatter();
  const formatter = new ImageFormatter();

  // Setup DOM environment using LinkeDOM if document is missing
  if (typeof globalThis.document === 'undefined') {
    const { document, window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.window = window;
  }

  const conversation = {
    title: 'PNG Export Test',
    messages: [
      { role: 'User', content: 'Hello AI!' },
      { role: 'Assistant', content: 'Hello Human! Here is code:\n```js\nconsole.log(1);\n```' },
    ],
    metadata: {
      Source: 'ChatGPT',
    },
  };

  const container = formatter.createScreenshotContainer(conversation);

  assert.ok(container);
  assert.equal(container.className, 'ai-exporter-png-container');

  const html = container.innerHTML;
  assert.ok(html.includes('PNG Export Test'));
  assert.ok(html.includes('ChatGPT'));
  assert.ok(html.includes('Hello AI!'));
  assert.ok(html.includes('Hello Human!'));
  assert.ok(html.includes('Exported with <strong>AI Chat Exporter</strong>'));
  assert.ok(html.includes('>https://ace.covai.org/</span>'));
  assert.ok(html.includes('.copy-code-btn'));
  assert.ok(html.includes('display: none !important'));
  assert.ok(html.includes('.code-card'));
});

test('ImageFormatter.createScreenshotContainer omits footer watermark when includeAttribution is false', async () => {
  const { ImageFormatter } = await importFormatter();
  const formatter = new ImageFormatter();

  if (typeof globalThis.document === 'undefined') {
    const { document, window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.window = window;
  }

  const conversation = {
    title: 'No Watermark Test',
    messages: [{ role: 'User', content: 'Hello AI!' }],
    metadata: { Source: 'ChatGPT' },
  };

  const container = formatter.createScreenshotContainer(conversation, {
    includeAttribution: false,
  });

  const html = container.innerHTML;
  assert.ok(!html.includes('Exported with'));
  assert.ok(!html.includes('AI Chat Exporter'));
  assert.ok(!html.includes('href="https://ace.covai.org"'));
  assert.ok(!html.includes('Footer Watermark'));
});

test('ImageFormatter.preloadImages sanitizes cross-origin images to prevent canvas taint', async () => {
  const { ImageFormatter } = await importFormatter();
  const formatter = new ImageFormatter();

  if (typeof globalThis.document === 'undefined') {
    const { document, window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.window = window;
  }

  const container = document.createElement('div');
  container.innerHTML = '<img src="https://example.com/blocked-avatar.png" alt="User Avatar" />';
  document.body.appendChild(container);

  await formatter.preloadImages(container);

  const img = container.querySelector('img');
  assert.equal(img, null); // Replaced with placeholder span
  const placeholder = container.querySelector('.ai-exporter-img-placeholder');
  assert.ok(placeholder);
  assert.ok(placeholder.textContent.includes('User Avatar'));
});

test('ImageFormatter.calculateSafeScale clamps scale on large containers to prevent canvas overflow', async () => {
  const { ImageFormatter } = await importFormatter();
  const formatter = new ImageFormatter();

  // 1. Standard sized container: scale remains requested scale (2)
  const standardEl = { offsetHeight: 2000, offsetWidth: 800 };
  assert.equal(formatter.calculateSafeScale(standardEl, 2), 2);

  // 2. Extremely tall container (e.g. 20,000px): scale is clamped so 20000 * scale <= 16384
  const giantEl = { offsetHeight: 20000, offsetWidth: 800 };
  const safeGiantScale = formatter.calculateSafeScale(giantEl, 2);
  assert.ok(safeGiantScale <= 16384 / 20000);
  assert.ok(safeGiantScale >= 0.2);

  // 3. Requested scale 1 on normal container remains 1
  assert.equal(formatter.calculateSafeScale(standardEl, 1), 1);
});

test('ImageFormatter.resolveThemePalette correctly maps themes and aliases', async () => {
  const { ImageFormatter, THEME_PALETTES } = await importFormatter();
  const formatter = new ImageFormatter();

  assert.equal(formatter.resolveThemePalette({ theme: 'dracula' }), THEME_PALETTES.dracula);
  assert.equal(formatter.resolveThemePalette({ theme: 'nord' }), THEME_PALETTES.nord);
  assert.equal(
    formatter.resolveThemePalette({ theme: 'github-dark' }),
    THEME_PALETTES['github-dark'],
  );
  assert.equal(
    formatter.resolveThemePalette({ theme: 'github-light' }),
    THEME_PALETTES['github-light'],
  );
  assert.equal(
    formatter.resolveThemePalette({ theme: 'solarized-dark' }),
    THEME_PALETTES['solarized-dark'],
  );
  assert.equal(
    formatter.resolveThemePalette({ theme: 'solarized-light' }),
    THEME_PALETTES['solarized-light'],
  );
  assert.equal(
    formatter.resolveThemePalette({ theme: 'modern-dark' }),
    THEME_PALETTES['modern-dark'],
  );
  assert.equal(
    formatter.resolveThemePalette({ theme: 'modern-light' }),
    THEME_PALETTES['modern-light'],
  );

  // Aliases
  assert.equal(formatter.resolveThemePalette({ theme: 'dark' }), THEME_PALETTES['modern-dark']);
  assert.equal(formatter.resolveThemePalette({ theme: 'light' }), THEME_PALETTES['modern-light']);

  // Backward compatibility with isDark boolean
  assert.equal(formatter.resolveThemePalette({ isDark: true }), THEME_PALETTES['modern-dark']);
  assert.equal(formatter.resolveThemePalette({ isDark: false }), THEME_PALETTES['modern-light']);
});

test('ImageFormatter.createScreenshotContainer applies selected theme colors and styles', async () => {
  const { ImageFormatter } = await importFormatter();
  const formatter = new ImageFormatter();

  if (typeof globalThis.document === 'undefined') {
    const { document, window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.window = window;
  }

  const conversation = {
    title: 'Themed Export Test',
    messages: [
      { role: 'User', content: 'What is the theme?' },
      { role: 'Assistant', content: 'This is Dracula theme.' },
    ],
    metadata: { Source: 'Claude' },
  };

  // 1. Dracula Theme
  const draculaContainer = formatter.createScreenshotContainer(conversation, { theme: 'dracula' });
  assert.ok(draculaContainer.style.cssText.includes('#282a36')); // Dracula bg
  assert.ok(draculaContainer.style.cssText.includes('#f8f8f2')); // Dracula text
  assert.ok(draculaContainer.innerHTML.includes('#bd93f9')); // Dracula accent

  // 2. Nord Theme
  const nordContainer = formatter.createScreenshotContainer(conversation, { theme: 'nord' });
  assert.ok(nordContainer.style.cssText.includes('#2e3440')); // Nord bg
  assert.ok(nordContainer.style.cssText.includes('#eceff4')); // Nord text

  // 3. Modern Dark Theme via theme: 'dark'
  const darkContainer = formatter.createScreenshotContainer(conversation, { theme: 'dark' });
  assert.ok(darkContainer.style.cssText.includes('#0f172a')); // Modern Dark bg
  assert.ok(darkContainer.style.cssText.includes('#f8fafc')); // Modern Dark text

  // 4. Solarized Light Theme
  const solarizedLightContainer = formatter.createScreenshotContainer(conversation, {
    theme: 'solarized-light',
  });
  assert.ok(solarizedLightContainer.style.cssText.includes('#fdf6e3')); // Solarized Light bg
  assert.ok(solarizedLightContainer.style.cssText.includes('#657b83')); // Solarized Light text

  // 5. Catppuccin Mocha Theme
  const catppuccinContainer = formatter.createScreenshotContainer(conversation, {
    theme: 'catppuccin',
  });
  assert.ok(catppuccinContainer.style.cssText.includes('#1e1e2e')); // Catppuccin Mocha bg
  assert.ok(catppuccinContainer.style.cssText.includes('#cdd6f4')); // Catppuccin text
  assert.ok(catppuccinContainer.innerHTML.includes('#b4befe')); // Catppuccin accent

  // 6. Monokai Theme
  const monokaiContainer = formatter.createScreenshotContainer(conversation, { theme: 'monokai' });
  assert.ok(monokaiContainer.style.cssText.includes('#272822')); // Monokai bg
  assert.ok(monokaiContainer.style.cssText.includes('#f8f8f2')); // Monokai text
  assert.ok(monokaiContainer.innerHTML.includes('#a6e22e')); // Monokai accent

  // 7. Synthwave '84 Theme
  const synthwaveContainer = formatter.createScreenshotContainer(conversation, {
    theme: 'synthwave',
  });
  assert.ok(synthwaveContainer.style.cssText.includes('#262335')); // Synthwave bg
  assert.ok(synthwaveContainer.style.cssText.includes('#f8f8f2')); // Synthwave text
  assert.ok(synthwaveContainer.innerHTML.includes('#ff7edb')); // Synthwave accent

  // 8. Gruvbox Theme
  const gruvboxContainer = formatter.createScreenshotContainer(conversation, { theme: 'gruvbox' });
  assert.ok(gruvboxContainer.style.cssText.includes('#282828')); // Gruvbox bg
  assert.ok(gruvboxContainer.style.cssText.includes('#ebdbb2')); // Gruvbox text
  assert.ok(gruvboxContainer.innerHTML.includes('#fe8019')); // Gruvbox accent
});

test('ImageFormatter.captureElement renders container with html2canvas and returns PNG blob', async () => {
  const { ImageFormatter } = await importFormatter();
  const formatter = new ImageFormatter();

  if (typeof globalThis.document === 'undefined') {
    const { document, window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.window = window;
  }

  let capturedOptions = null;
  globalThis.html2canvas = async (el, opts) => {
    capturedOptions = opts;
    return {
      toBlob: (cb) => cb(new Blob(['mock-png-data'], { type: 'image/png' })),
    };
  };

  const container = document.createElement('div');
  container.className = 'container';
  container.innerHTML = '<p>Test conversation</p>';
  document.body.appendChild(container);

  try {
    const blob = await formatter.captureElement(container, {
      highQuality: true,
      theme: 'dracula',
    });

    assert.ok(blob);
    assert.equal(blob.type, 'image/png');
    assert.ok(capturedOptions);
    assert.equal(capturedOptions.scale, 2);
    assert.equal(capturedOptions.backgroundColor, '#282a36');
  } finally {
    delete globalThis.html2canvas;
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
});
