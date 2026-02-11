/**
 * VIA All Keycodes – Background Service Worker
 *
 * Handles the toolbar icon click to toggle the extension on/off.
 * Persists state in chrome.storage.local and communicates with
 * the content script via chrome.tabs.sendMessage.
 */

const STORAGE_KEY = 'viaExtEnabled';

// ─── Badge / Icon helpers ─────────────────────────────────────

async function updateIcon(tabId: number, enabled: boolean) {
  // Badge text: empty when on, "OFF" when disabled
  await chrome.action.setBadgeText({
    text: enabled ? '' : 'OFF',
    tabId,
  });
  await chrome.action.setBadgeBackgroundColor({
    color: '#666',
    tabId,
  });
  await chrome.action.setTitle({
    title: enabled
      ? 'VIA All Keycodes (click to disable)'
      : 'VIA All Keycodes (click to enable)',
    tabId,
  });
}

async function getEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  // Default to enabled
  return result[STORAGE_KEY] !== false;
}

async function setEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({[STORAGE_KEY]: enabled});
}

// ─── Toolbar icon click handler ───────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  const enabled = await getEnabled();
  const newState = !enabled;
  await setEnabled(newState);

  if (tab.id !== undefined) {
    updateIcon(tab.id, newState);

    // Notify the content script
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'via-ext-toggle',
        enabled: newState,
      });
    } catch {
      // Content script may not be loaded yet – that's OK,
      // it will read storage on init.
    }
  }
});

// ─── Set icon state when a matching tab is activated or loaded ─

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.url &&
    (tab.url.includes('usevia.app') || tab.url.includes('localhost'))
  ) {
    const enabled = await getEnabled();
    updateIcon(tabId, enabled);
  }
});

chrome.tabs.onActivated.addListener(async ({tabId}) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (
      tab.url &&
      (tab.url.includes('usevia.app') || tab.url.includes('localhost'))
    ) {
      const enabled = await getEnabled();
      updateIcon(tabId, enabled);
    }
  } catch {
    // Tab may have been closed
  }
});
