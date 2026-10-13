import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const EXTENSION_PATH = path.resolve(__dirname, '../.output/chrome-mv3');

export type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  openExtensionPage: (pagePath: string) => Promise<Page>;
  setStorage: (area: 'local' | 'sync', items: Record<string, unknown>) => Promise<void>;
};

export const test = base.extend<ExtensionFixtures>({
  // Override context to launch Chromium with unpacked extension
  context: async ({}, use) => {
    const isHeadless = !process.env.HEADED;
    const args = [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-gpu',
    ];

    if (isHeadless) {
      args.push('--headless=new');
    }

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false, // Must be false so args --headless=new takes effect with extension support
      args,
    });

    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
    }
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },

  openExtensionPage: async ({ context, extensionId }, use) => {
    await use(async (pagePath: string) => {
      const cleanPath = pagePath.startsWith('/') ? pagePath.slice(1) : pagePath;
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${cleanPath}`);
      await page.waitForLoadState('domcontentloaded');
      return page;
    });
  },

  setStorage: async ({ serviceWorker }, use) => {
    await use(async (area: 'local' | 'sync', items: Record<string, unknown>) => {
      await serviceWorker.evaluate(
        ({ areaName, data }) => {
          return new Promise<void>((resolve, reject) => {
            const storageArea = (chrome.storage as any)[areaName];
            if (!storageArea) return reject(new Error(`Storage area ${areaName} not found`));
            storageArea.set(data, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
        },
        { areaName: area, data: items },
      );
    });
  },
});

export const expect = test.expect;
