import { defineConfig } from 'wxt';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  zip: {
    artifactTemplate: '{{name}}-{{browser}}.zip',
  },
  hooks: {
    'zip:start': (wxt) => {
      if (wxt.config.browser === 'chrome') {
        wxt.config.zip.artifactTemplate = '{{name}}-chromium.zip';
      }
    },
    'build:manifestGenerated': (wxt, manifest) => {
      if (manifest.options_ui) {
        manifest.options_ui.open_in_tab = true;
      }
      if (wxt.config.browser === 'firefox' && manifest.sidebar_action) {
        manifest.sidebar_action.default_icon = {
          '16': 'icons/icon16.png',
          '48': 'icons/icon48.png',
          '128': 'icons/icon128.png',
        };
        manifest.sidebar_action.default_title = '__MSG_extensionShortName__';
        manifest.sidebar_action.open_at_install = false;
      }
    },
  },
  vite: () => ({
    define: {
      __KATEX_CSS__: JSON.stringify(
        fs.readFileSync(path.resolve('content/lib/katex/katex.min.css'), 'utf8'),
      ),
      __KATEX_JS__: JSON.stringify(
        fs.readFileSync(path.resolve('content/lib/katex/katex.min.js'), 'utf8'),
      ),
      __AUTO_RENDER_JS__: JSON.stringify(
        fs.readFileSync(path.resolve('content/lib/katex/auto-render.min.js'), 'utf8'),
      ),
      __PRISM_CSS__: JSON.stringify(
        fs.readFileSync(path.resolve('content/lib/prismjs/prism-tomorrow.min.css'), 'utf8'),
      ),
      __PRISM_JS__: JSON.stringify(
        fs.readFileSync(path.resolve('content/lib/prismjs/prism-bundle.js'), 'utf8'),
      ),
    },
    build: {
      modulePreload: false,
    },
    plugins: [
      {
        name: 'escape-non-printable-utf8',
        generateBundle(_options, bundle) {
          for (const file of Object.values(bundle)) {
            if (file.type === 'chunk' && file.code) {
              file.code = file.code.replace(/[\uFDD0-\uFDEF\uFFFE\uFFFF]/g, (match) => {
                return '\\u' + match.charCodeAt(0).toString(16).padStart(4, '0');
              });
            }
          }
        },
      },
    ],
  }),
  manifestVersion: 3,
  manifest: ({ browser }) => {
    const isFirefox = browser === 'firefox';
    const isEdge = browser === 'edge';

    const permissions = [
      'activeTab',
      'tabs',
      'scripting',
      'storage',
      'contextMenus',
      'clipboardWrite',
    ];
    if (!isFirefox) {
      permissions.push('sidePanel');
    }

    const hostPermissions = ['<all_urls>'];

    const baseManifest: any = {
      default_locale: 'en',
      name: isEdge
        ? '__MSG_extensionNameEdge__'
        : isFirefox
          ? '__MSG_extensionNameFirefox__'
          : '__MSG_extensionName__',
      short_name: '__MSG_extensionShortName__',
      description: '__MSG_extensionDescription__',
      homepage_url: 'https://ace.covai.org/',
      permissions,
      host_permissions: hostPermissions,
      action: {
        default_popup: 'entrypoints/popup/index.html',
        default_icon: {
          '16': 'icons/icon16.png',
          '48': 'icons/icon48.png',
          '128': 'icons/icon128.png',
        },
      },
      icons: {
        '16': 'icons/icon16.png',
        '48': 'icons/icon48.png',
        '128': 'icons/icon128.png',
      },
      options_ui: {
        page: 'options.html',
        open_in_tab: true,
      },
      options_page: 'options.html',
      commands: {
        copy_markdown: {
          suggested_key: {
            default: 'Alt+Shift+C',
            mac: 'Alt+Shift+C',
          },
          description: '__MSG_commandCopyMarkdown__',
        },
        download_markdown: {
          suggested_key: {
            default: 'Alt+Shift+D',
            mac: 'Alt+Shift+D',
          },
          description: '__MSG_commandDownloadMarkdown__',
        },
        open_preview: {
          suggested_key: {
            default: 'Alt+Shift+P',
            mac: 'Alt+Shift+P',
          },
          description: '__MSG_commandOpenPreview__',
        },
      },
      web_accessible_resources: [
        {
          resources: [
            'content/chatgpt_helper.js',
            'content/claude_react_reader.js',
            'content/lib/*',
            'schemas/*',
          ],
          matches: ['<all_urls>'],
        },
      ],
    };

    if (!isFirefox) {
      baseManifest.side_panel = {
        default_path: 'entrypoints/sidepanel/index.html',
      };
    }

    if (isFirefox) {
      baseManifest.sidebar_action = {
        default_panel: 'entrypoints/sidepanel/index.html',
        default_title: '__MSG_extensionShortName__',
        open_at_install: false,
        default_icon: {
          '16': 'icons/icon16.png',
          '48': 'icons/icon48.png',
          '128': 'icons/icon128.png',
        },
      };
      baseManifest.browser_specific_settings = {
        gecko: {
          id: 'ai-chat-exporter@local.dev',
          strict_min_version: '143.0',
          data_collection_permissions: {
            required: ['none'],
          },
        },
      };
    }

    return baseManifest;
  },
});
