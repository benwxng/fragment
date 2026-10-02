import type { ExtensionMessage, ExtensionResponse } from '../src/messages';
import { CloudError } from '../src/cloud/client';
import {
  getCloudState,
  deleteReference, saveReference, listReferences, importLegacyReferences,
  signIn,
  signOut,
} from '../src/cloud/library';

const INSPECTOR_FILE = '/inspector.js';
const ERROR_BADGE_DURATION_MS = 2_500;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown extension error';
}

async function showActionError(tabId: number, message: string): Promise<void> {
  await Promise.all([
    browser.action.setBadgeBackgroundColor({ tabId, color: '#B42318' }),
    browser.action.setBadgeText({ tabId, text: '!' }),
    browser.action.setTitle({
      tabId,
      title: `Glance cannot inspect this page: ${message}`,
    }),
  ]);

  setTimeout(() => {
    void browser.action.setBadgeText({ tabId, text: '' });
    void browser.action.setTitle({ tabId, title: 'Inspect this page' });
  }, ERROR_BADGE_DURATION_MS);
}

async function toggleInspector(tab: Browser.tabs.Tab): Promise<void> {
  if (tab.id == null) return;

  try {
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: [INSPECTOR_FILE],
    });
  } catch (error) {
    await showActionError(tab.id, errorMessage(error));
  }
}

async function openLibrary(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL('/library.html') });
}

async function getActiveTab(): Promise<Browser.tabs.Tab | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function handleMessage(
  message: ExtensionMessage,
  sender: Browser.runtime.MessageSender,
): Promise<ExtensionResponse> {
  try {
    switch (message.type) {
      case 'capture-visible-tab': {
        const imageDataUrl = sender.tab?.windowId == null
          ? await browser.tabs.captureVisibleTab({ format: 'png' })
          : await browser.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
        return { ok: true, imageDataUrl };
      }

      case 'save-reference':
        return { ok: true, userId: await saveReference(message.reference, message.expectedUserId) };

      case 'delete-reference':
        await deleteReference(message.id, message.expectedUserId);
        return { ok: true };

      case 'open-library':
        await openLibrary();
        return { ok: true };

      case 'get-cloud-state':
        return { ok: true, cloudState: await getCloudState() };

      case 'cloud-sign-in':
        return { ok: true, cloudState: await signIn() };

      case 'cloud-sign-out':
        return { ok: true, cloudState: await signOut() };

      case 'list-references':
        return { ok: true, ...await listReferences() };
      case 'import-legacy':
        return { ok: true, imported: await importLegacyReferences() };
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error),
      ...(error instanceof CloudError && (error.status === 401 || error.status === 403) ? { resetLibrary: true } : {}) };
  }
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    void toggleInspector(tab);
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === 'open-library') {
      void openLibrary();
      return;
    }

    if (command === 'toggle-inspector') {
      void getActiveTab().then((tab) => {
        if (tab) void toggleInspector(tab);
      });
    }
  });

  browser.runtime.onMessage.addListener((message, sender) =>
    handleMessage(message as ExtensionMessage, sender),
  );

  // Remove the previous offline-sync schedule when upgrading an installation.
  void browser.alarms.clear('refer-cloud-sync');
});
