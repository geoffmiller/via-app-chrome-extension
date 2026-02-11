/**
 * VIA All Keycodes – Content Script
 *
 * Injects:
 * 1. A persistent search bar at the top of the keycode content pane.
 *    Typing shows filtered results from all categories as an overlay.
 *    Clearing the search reveals VIA's normal category content underneath.
 * 2. An "All Keycodes" category in the left sidebar (after "Special").
 *    Clicking it shows the full unfiltered master list.
 */

import {getAllKeycodes, IKeycode} from '../data/keycodes';
import './styles.css';

const CATEGORY_ID = 'via-ext-all-keycodes';
const OVERLAY_ID = 'via-ext-overlay';
const SEARCH_ID = 'via-ext-search';
const SEARCH_WRAP_ID = 'via-ext-search-wrap';
const ANY_MOVED_ATTR = 'data-via-ext-any-moved';
const allKeycodes = getAllKeycodes();
const IS_MAC = navigator.platform.toUpperCase().includes('MAC');
const SHORTCUT_HINT = IS_MAC ? '⌘K' : 'Ctrl+K';

// Performance and timing constants
const MUTATION_DEBOUNCE_MS = 80; // Batch React re-renders to avoid excessive observer callbacks
const MAX_VIA_PANE_POLL_ATTEMPTS = 100; // ~1.6s of polling via requestAnimationFrame
const SPA_NAVIGATION_RENDER_DELAY_MS = 200; // Wait for React to render after SPA route change

// ─── Helpers ──────────────────────────────────────────────────

/** Find the submenu container (left sidebar with category rows) */
function findSubmenuContainer(): HTMLElement | null {
  const allDivs = document.querySelectorAll('div');
  for (const div of allDivs) {
    const children = div.children;
    if (children.length >= 3) {
      const texts = Array.from(children).map((c) =>
        (c.textContent || '').trim().toUpperCase(),
      );
      if (texts.includes('BASIC') && texts.includes('SPECIAL')) {
        return div as HTMLElement;
      }
    }
  }
  return null;
}

/** Find the overflow cell that shows the keycode grid (right pane) */
function findKeycodeContainer(): HTMLElement | null {
  const submenu = findSubmenuContainer();
  if (!submenu) return null;

  let submenuCell = submenu.parentElement;
  while (submenuCell && !submenuCell.nextElementSibling) {
    submenuCell = submenuCell.parentElement;
  }

  if (submenuCell && submenuCell.nextElementSibling) {
    return submenuCell.nextElementSibling as HTMLElement;
  }
  return null;
}

/** Find the "Special" category row element */
function findSpecialRow(container: HTMLElement): HTMLElement | null {
  for (const child of Array.from(container.children)) {
    if ((child.textContent || '').trim().toUpperCase() === 'SPECIAL') {
      return child as HTMLElement;
    }
  }
  return null;
}

// ─── Persistent Search Bar ────────────────────────────────────

function injectSearchBar() {
  const container = findKeycodeContainer();
  if (!container || document.getElementById(SEARCH_WRAP_ID)) return;

  container.style.position = 'relative';

  const searchWrap = document.createElement('div');
  searchWrap.id = SEARCH_WRAP_ID;

  const searchInput = document.createElement('input');
  searchInput.id = SEARCH_ID;
  searchInput.type = 'text';
  searchInput.placeholder = `Search all keycodes… (${SHORTCUT_HINT})`;
  searchInput.addEventListener('input', () => {
    onSearchInput(searchInput.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      onSearchInput('');
      searchInput.blur();
    }
    // Arrow down or Tab moves focus to the first list row
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      const firstRow = document.querySelector(
        '.via-ext-list-row',
      ) as HTMLElement | null;
      if (firstRow) {
        e.preventDefault();
        firstRow.focus();
      }
    }
  });

  searchWrap.appendChild(searchInput);
  container.insertBefore(searchWrap, container.firstChild);
}

function onSearchInput(value: string) {
  const needle = value.trim();
  if (needle.length > 0) {
    showResultsOverlay(needle);
  } else {
    removeResultsOverlay();
  }
}

// ─── Results Overlay ──────────────────────────────────────────

function showResultsOverlay(filter: string) {
  const container = findKeycodeContainer();
  if (!container) return;

  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'via-ext-overlay';

    // Insert after the search bar
    const searchWrap = document.getElementById(SEARCH_WRAP_ID);
    if (searchWrap && searchWrap.nextSibling) {
      container.insertBefore(overlay, searchWrap.nextSibling);
    } else {
      container.appendChild(overlay);
    }
  }

  // Rebuild grid contents
  overlay.innerHTML = '';

  const countEl = document.createElement('div');
  countEl.id = 'via-ext-result-count';
  overlay.appendChild(countEl);

  const listEl = document.createElement('div');
  listEl.id = 'via-ext-keycode-list';
  overlay.appendChild(listEl);

  renderKeycodeList(listEl, countEl, filter);
}

function removeResultsOverlay() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.remove();
}

// ─── "All Keycodes" Menu Item ─────────────────────────────────

function createCategoryRow(): HTMLElement {
  const row = document.createElement('div');
  row.id = CATEGORY_ID;
  row.className = 'via-ext-submenu-row';
  row.textContent = 'All Keycodes';
  row.addEventListener('click', () => activateAllKeycodes());
  return row;
}

function activateAllKeycodes() {
  const ourRow = document.getElementById(CATEGORY_ID);
  if (ourRow) {
    ourRow.classList.add('selected');
  }

  // Clear the search input and show full list
  const searchInput = document.getElementById(
    SEARCH_ID,
  ) as HTMLInputElement | null;
  if (searchInput) {
    searchInput.value = '';
  }

  showResultsOverlay('');
}

function deactivateAllKeycodes() {
  const ourRow = document.getElementById(CATEGORY_ID);
  if (ourRow) {
    ourRow.classList.remove('selected');
  }
  removeResultsOverlay();
}

// ─── Keycode List Rendering ───────────────────────────────────

function renderKeycodeList(
  listEl: HTMLElement,
  countEl: HTMLElement,
  filter: string,
) {
  const needle = filter.toLowerCase().trim();

  const filtered = needle
    ? allKeycodes.filter(
        (kc) =>
          kc.name.toLowerCase().includes(needle) ||
          kc.code.toLowerCase().includes(needle) ||
          (kc.title || '').toLowerCase().includes(needle) ||
          (kc.shortName || '').toLowerCase().includes(needle),
      )
    : allKeycodes;

  for (const kc of filtered) {
    listEl.appendChild(createKeycodeRow(kc));
  }

  countEl.textContent = `${filtered.length} keycode${filtered.length !== 1 ? 's' : ''}`;
}

function createKeycodeRow(kc: IKeycode): HTMLElement {
  const row = document.createElement('div');
  row.className = 'via-ext-list-row';
  row.tabIndex = 0;
  row.title = kc.title || kc.code;

  // Mini key icon
  const icon = document.createElement('div');
  icon.className = 'via-ext-list-icon';
  const iconLabel = document.createElement('span');
  iconLabel.textContent = kc.shortName || kc.name || kc.code;
  icon.appendChild(iconLabel);
  row.appendChild(icon);

  // Name / description
  const nameEl = document.createElement('div');
  nameEl.className = 'via-ext-list-name';
  nameEl.textContent = kc.title || kc.name;
  row.appendChild(nameEl);

  // Code
  const codeEl = document.createElement('div');
  codeEl.className = 'via-ext-list-code';
  codeEl.textContent = kc.code;
  row.appendChild(codeEl);

  // Keyboard navigation on rows
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      row.click();
      return;
    }
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      const next = row.nextElementSibling as HTMLElement | null;
      if (next && next.classList.contains('via-ext-list-row')) {
        next.focus();
      }
      return;
    }
    if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      const prev = row.previousElementSibling as HTMLElement | null;
      if (prev && prev.classList.contains('via-ext-list-row')) {
        prev.focus();
      } else {
        // Jump back to search input
        const searchInput = document.getElementById(
          SEARCH_ID,
        ) as HTMLInputElement | null;
        if (searchInput) searchInput.focus();
      }
      return;
    }
    if (e.key === 'Escape') {
      const searchInput = document.getElementById(
        SEARCH_ID,
      ) as HTMLInputElement | null;
      if (searchInput) {
        searchInput.value = '';
        onSearchInput('');
        searchInput.focus();
      }
      return;
    }
    // Any other printable key — jump to search and type there
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const searchInput = document.getElementById(
        SEARCH_ID,
      ) as HTMLInputElement | null;
      if (searchInput) {
        searchInput.focus();
        // The keystroke will naturally go into the now-focused input
      }
    }
  });

  row.addEventListener('click', () => {
    // Try to open VIA's Any modal and pre-fill the keycode
    const didOpen = clickViaAnyAndFill(kc.code);

    // Show visual feedback
    row.classList.add('via-ext-list-row-active');
    const origName = nameEl.textContent;
    nameEl.textContent = didOpen
      ? '⏳ Opening modal…'
      : '✓ Copied to clipboard';

    if (!didOpen) {
      navigator.clipboard.writeText(kc.code);
    }

    setTimeout(() => {
      row.classList.remove('via-ext-list-row-active');
      nameEl.textContent = origName;
    }, 1200);
  });

  return row;
}

// ─── Move VIA's "Any" to front of Special category ──────────

/**
 * Find VIA's native "Any" button in the current keycode grid.
 * Returns the element and its parent grid, or null if not found.
 */
function findAnyElement(): {el: HTMLElement; parent: HTMLElement} | null {
  const container = findKeycodeContainer();
  if (!container) return null;

  for (const el of container.querySelectorAll('*')) {
    const text = (el as HTMLElement).textContent?.trim();
    if (text === 'Any' && el.children.length <= 2) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.width < 200 &&
        rect.height > 0 &&
        rect.height < 200
      ) {
        const parent = (el as HTMLElement).parentElement;
        if (parent) return {el: el as HTMLElement, parent};
      }
    }
  }
  return null;
}

function moveAnyToFront() {
  const found = findAnyElement();
  if (!found) return;

  const {el, parent} = found;

  // Already first or already moved — nothing to do
  if (parent.firstElementChild === el) return;
  if (el.hasAttribute(ANY_MOVED_ATTR)) return;

  el.setAttribute(ANY_MOVED_ATTR, 'true');
  parent.insertBefore(el, parent.firstElementChild);
}

// ─── Simulate click on VIA's "Any" button ─────────────────────

/**
 * Simulates a complete click sequence with proper coordinates.
 * Some React handlers inspect event coordinates, so we calculate them.
 */
function simulateClick(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const eventOptions = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: centerX,
    clientY: centerY,
  };

  element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
  element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
  element.dispatchEvent(new MouseEvent('click', eventOptions));
}

/**
 * Click VIA's "Any" button to open the KeycodeModal,
 * then fill the input with `code` and click Confirm.
 *
 * React 17+ attaches event listeners at the root, so dispatching
 * native DOM events with bubbling triggers React handlers.
 */
function clickViaAnyAndFill(code: string) {
  const submenu = findSubmenuContainer();
  if (!submenu) return false;

  const specialRow = findSpecialRow(submenu);
  if (!specialRow) return false;

  // Switch to Special category so the Any button exists in the DOM
  simulateClick(specialRow);

  // Wait for React to re-render, then click the Any button
  setTimeout(() => {
    const found = findAnyElement();
    if (!found) {
      console.warn(
        '[VIA Ext] Could not find Any button after switching to Special',
      );
      navigator.clipboard.writeText(code);
      return;
    }

    simulateClick(found.el);

    // Wait for the modal to render, then fill the input
    setTimeout(() => fillModalInput(code), 150);
  }, 100);

  return true;
}

/**
 * Find the modal's text input, set it to `code`, and trigger React's
 * change detection so the Confirm button becomes enabled.
 */
function fillModalInput(code: string) {
  // The modal renders a TextInput with placeholder containing "KC_NO"
  // Look for an input inside a modal-like overlay
  const inputs = document.querySelectorAll('input[type="text"]');
  let targetInput: HTMLInputElement | null = null;

  for (const inp of inputs) {
    const input = inp as HTMLInputElement;
    const placeholder = input.placeholder || '';
    // The modal input has placeholder like "KC_NO, 0xFF, etc."
    if (placeholder.includes('KC_') || placeholder.includes('0x')) {
      targetInput = input;
      break;
    }
  }

  if (!targetInput) {
    console.warn('[VIA Ext] Could not find modal input');
    navigator.clipboard.writeText(code);
    return;
  }

  // Use the native setter to bypass React's controlled input
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(targetInput, code);
  } else {
    targetInput.value = code;
  }

  // Dispatch InputEvent with proper metadata for React's onChange handler
  targetInput.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: code,
    }),
  );

  // Also dispatch change for good measure
  targetInput.dispatchEvent(new Event('change', {bubbles: true}));

  // Force React 16's internal value tracker to see the change
  interface ReactInputWithTracker extends HTMLInputElement {
    _valueTracker?: {
      setValue(value: string): void;
    };
  }
  const tracker = (targetInput as ReactInputWithTracker)._valueTracker;
  if (tracker) {
    tracker.setValue('');
  }

  targetInput.focus();
}

// ─── Injection & Observation ──────────────────────────────────

function injectCategory() {
  const submenu = findSubmenuContainer();
  if (!submenu) return false;

  if (document.getElementById(CATEGORY_ID)) return true;

  const specialRow = findSpecialRow(submenu);
  if (!specialRow) return false;

  const row = createCategoryRow();

  if (specialRow.nextSibling) {
    submenu.insertBefore(row, specialRow.nextSibling);
  } else {
    submenu.appendChild(row);
  }

  // Clicks on VIA categories deactivate our "All Keycodes" view
  for (const child of Array.from(submenu.children)) {
    if (child.id !== CATEGORY_ID) {
      child.addEventListener('click', () => deactivateAllKeycodes());
    }
  }

  return true;
}

function injectAll() {
  injectCategory();
  injectSearchBar();
  moveAnyToFront();
}

// Debounced MutationObserver for React re-renders
let observerTimeout: number | undefined;

const observer = new MutationObserver(() => {
  // Skip if already scheduled
  if (observerTimeout !== undefined) return;

  observerTimeout = window.setTimeout(() => {
    observerTimeout = undefined;

    const categoryMissing = !document.getElementById(CATEGORY_ID);
    const searchMissing = !document.getElementById(SEARCH_WRAP_ID);

    if (categoryMissing || searchMissing) {
      injectAll();
    }

    // Always try to move Any to front — VIA re-renders the grid
    // when switching categories, so the marker attribute will be gone.
    moveAnyToFront();
  }, MUTATION_DEBOUNCE_MS);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: false,
  characterData: false,
});

// Wait for React to mount before initial injection
async function waitForViaPane(): Promise<void> {
  return new Promise((resolve) => {
    let attempts = 0;

    function check() {
      attempts++;
      const container = findSubmenuContainer();

      if (container) {
        resolve();
        return;
      }

      if (attempts >= MAX_VIA_PANE_POLL_ATTEMPTS) {
        console.warn(
          '[VIA Ext] VIA pane not found after polling. MutationObserver will pick it up later.',
        );
        resolve();
        return;
      }

      requestAnimationFrame(check);
    }

    requestAnimationFrame(check);
  });
}

waitForViaPane().then(() => {
  injectAll();
});

// Clean up observer on extension unload
window.addEventListener('unload', () => {
  observer.disconnect();
  if (observerTimeout !== undefined) {
    clearTimeout(observerTimeout);
  }
});

// ─── Handle SPA Navigation (History API) ──────────────────────

function onRouteChange() {
  // Wait for React to render after navigation
  setTimeout(() => {
    injectAll();
  }, SPA_NAVIGATION_RENDER_DELAY_MS);
}

// Override history methods to detect SPA navigation
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function (
  data: any,
  unused: string,
  url?: string | URL | null,
) {
  originalPushState.call(this, data, unused, url);
  onRouteChange();
};

history.replaceState = function (
  data: any,
  unused: string,
  url?: string | URL | null,
) {
  originalReplaceState.call(this, data, unused, url);
  onRouteChange();
};

// Listen for back/forward navigation
window.addEventListener('popstate', () => {
  onRouteChange();
});

// ─── Global Keyboard Shortcut: Cmd+K / Ctrl+K ────────────────

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    const searchInput = document.getElementById(
      SEARCH_ID,
    ) as HTMLInputElement | null;
    if (searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  }
});

console.log('[VIA All Keycodes Extension] Content script loaded');
