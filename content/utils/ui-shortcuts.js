/**
 * Shared theme-aware tooltips, local shortcut dispatcher, and shortcut cheat-sheet.
 */

function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.isContentEditable);
}

/**
 * Queries browser-configured global commands safely.
 * @returns {Promise<Array<{ name: string, description: string, shortcut: string }>>}
 */
export async function getBrowserCommands() {
  try {
    if (typeof chrome !== 'undefined' && chrome.commands?.getAll) {
      const cmds = await chrome.commands.getAll();
      return Array.isArray(cmds) ? cmds : [];
    }
  } catch {
    // Ignore in non-extension or restricted contexts
  }
  return [];
}

/**
 * Opens the browser's extension shortcut configuration page.
 */
export function openBrowserShortcutsPage() {
  const isFirefox =
    typeof chrome !== 'undefined' &&
    Boolean(chrome.runtime?.getURL?.('')?.startsWith('moz-extension://'));
  if (isFirefox) {
    return false;
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      Promise.resolve(chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })).catch(() => {});
      return true;
    }
  } catch {
    // Ignore when tabs API is unavailable
  }
  return false;
}

/**
 * Initializes delegated theme-aware tooltips for elements with `data-tooltip`.
 * Optional `data-shortcut` renders a `<kbd class="ace-kbd">` badge inside the tooltip.
 */
export function initTooltips() {
  if (typeof document === 'undefined') return () => {};
  if (document.body.dataset.aceTooltipsInit === '1') return () => {};
  document.body.dataset.aceTooltipsInit = '1';

  const tooltip = document.createElement('div');
  tooltip.className = 'ace-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  const labelSpan = document.createElement('span');
  const kbdEl = document.createElement('kbd');
  kbdEl.className = 'ace-kbd';
  tooltip.appendChild(labelSpan);
  tooltip.appendChild(kbdEl);
  document.body.appendChild(tooltip);

  let activeTarget = null;

  const positionTooltip = (target) => {
    const rect = target.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const pad = 8;

    let top = rect.bottom + 6;
    if (top + tipRect.height > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - tipRect.height - 6);
    }

    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tipRect.width - pad));

    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
  };

  const show = (target) => {
    const text = target?.dataset?.tooltip;
    if (!text) return;
    activeTarget = target;
    labelSpan.textContent = text;
    const shortcut = target.dataset.shortcut;
    if (shortcut) {
      kbdEl.textContent = shortcut;
      kbdEl.style.display = 'inline-flex';
    } else {
      kbdEl.style.display = 'none';
    }
    tooltip.classList.add('visible');
    positionTooltip(target);
  };

  const hide = () => {
    activeTarget = null;
    tooltip.classList.remove('visible');
  };

  const onMouseOver = (e) => {
    const target = e.target?.closest?.('[data-tooltip]');
    if (target) show(target);
  };

  const onMouseOut = (e) => {
    if (!activeTarget) return;
    const related = e.relatedTarget?.closest?.('[data-tooltip]');
    if (related !== activeTarget) hide();
  };

  const onFocusIn = (e) => {
    const target = e.target?.closest?.('[data-tooltip]');
    if (target) show(target);
  };

  const onFocusOut = () => hide();

  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);

  return () => {
    document.removeEventListener('mouseover', onMouseOver);
    document.removeEventListener('mouseout', onMouseOut);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    tooltip.remove();
    delete document.body.dataset.aceTooltipsInit;
  };
}

/**
 * Registers single-key local shortcuts when focus is not inside an editable control.
 * @param {Record<string, (e: KeyboardEvent) => void>} bindings
 * @param {{ onEscape?: (e: KeyboardEvent) => void }} [options]
 * @returns {() => void} cleanup function
 */
export function registerShortcutHandler(bindings, options = {}) {
  const handlerMap = new Map(Object.entries(bindings));

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (isEditableTarget(e.target)) {
        e.target.blur();
      }
      options.onEscape?.(e);
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isEditableTarget(e.target)) return;

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const handler = handlerMap.get(key);
    if (handler) {
      e.preventDefault();
      handler(e);
    }
  };

  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}

/**
 * Creates and manages a theme-aware shortcut cheat-sheet modal.
 * @param {{ title?: string, localShortcuts: Array<{ key: string, label: string }> }} config
 */
export function createShortcutSheet({ title = 'Keyboard Shortcuts', localShortcuts = [] }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'ace-shortcut-backdrop hidden';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', title);

  const dialog = document.createElement('div');
  dialog.className = 'ace-shortcut-dialog';

  const header = document.createElement('div');
  header.className = 'ace-shortcut-header';
  const heading = document.createElement('h2');
  heading.className = 'ace-shortcut-title';
  heading.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ace-shortcut-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  header.append(heading, closeBtn);

  const localTitle = document.createElement('div');
  localTitle.className = 'ace-shortcut-section-title';
  localTitle.textContent = 'Quick Keys (When Open)';

  const localList = document.createElement('div');
  localList.className = 'ace-shortcut-list';
  for (const item of localShortcuts) {
    const row = document.createElement('div');
    row.className = 'ace-shortcut-row';
    const label = document.createElement('span');
    label.textContent = item.label;
    const kbd = document.createElement('kbd');
    kbd.className = 'ace-kbd';
    kbd.textContent = item.key;
    row.append(label, kbd);
    localList.appendChild(row);
  }

  const globalTitle = document.createElement('div');
  globalTitle.className = 'ace-shortcut-section-title';
  globalTitle.textContent = 'Browser Global Shortcuts';

  const globalList = document.createElement('div');
  globalList.className = 'ace-shortcut-list';

  const footer = document.createElement('div');
  footer.className = 'ace-shortcut-footer';
  const configHint = document.createElement('span');
  configHint.className = 'ace-shortcut-hint';
  configHint.style.fontSize = '11.5px';
  configHint.style.color = 'var(--text-muted)';
  const configBtn = document.createElement('button');
  configBtn.type = 'button';
  configBtn.className = 'ace-shortcut-config-btn';
  configBtn.textContent = 'Configure Browser Shortcuts ↗';
  configBtn.addEventListener('click', () => {
    const opened = openBrowserShortcutsPage();
    if (!opened) {
      configHint.textContent = 'Open about:addons → ⚙ → Manage Extension Shortcuts';
    }
  });
  footer.append(configHint, configBtn);

  dialog.append(header, localTitle, localList, globalTitle, globalList, footer);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const renderGlobalCommands = async () => {
    const cmds = await getBrowserCommands();
    globalList.textContent = '';
    if (!cmds.length) {
      const empty = document.createElement('div');
      empty.className = 'ace-shortcut-row';
      empty.textContent = 'Manage in chrome://extensions/shortcuts';
      globalList.appendChild(empty);
      return;
    }
    for (const cmd of cmds) {
      const row = document.createElement('div');
      row.className = 'ace-shortcut-row';
      const label = document.createElement('span');
      label.textContent =
        cmd.description || (cmd.name === '_execute_action' ? 'Open Popup' : cmd.name);
      const kbd = document.createElement('kbd');
      kbd.className = 'ace-kbd';
      kbd.textContent = cmd.shortcut || 'Not set';
      row.append(label, kbd);
      globalList.appendChild(row);
    }
  };

  const open = async () => {
    await renderGlobalCommands();
    backdrop.classList.remove('hidden');
  };

  const close = () => backdrop.classList.add('hidden');
  const toggle = () => (backdrop.classList.contains('hidden') ? open() : close());
  const isOpen = () => !backdrop.classList.contains('hidden');

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  return { open, close, toggle, isOpen };
}
