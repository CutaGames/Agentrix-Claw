/**
 * Agentrix Chrome Extension — background service worker.
 * Manifest V3, ES module.
 *
 * Responsibilities:
 *   - Open the side panel when the toolbar action is clicked.
 *   - Bind the Ctrl+Shift+A command to open the side panel on the active tab.
 *   - Register a context-menu item to send the selected text to Agentrix chat.
 */

// Make the action click open the side panel for the active tab.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn("[agentrix] setPanelBehavior failed", err));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "agentrix-send-selection",
    title: "Ask Agentrix about \"%s\"",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "agentrix-send-selection") return;
  const text = (info.selectionText || "").trim();
  if (!text || !tab?.id) return;
  await chrome.storage.session.set({ agentrix_pending_prompt: text });
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-sidebar") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Bridge messages from sidepanel.html (e.g. "summarize current page")
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "agentrix:get-active-tab") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      sendResponse({ url: tab?.url, title: tab?.title });
    });
    return true; // async
  }
  if (msg?.type === "agentrix:get-page-text") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.id) return sendResponse({ text: "" });
      try {
        const [{ result } = { result: "" }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.body?.innerText?.slice(0, 50_000) ?? "",
        });
        sendResponse({ text: result, url: tab.url, title: tab.title });
      } catch (e) {
        sendResponse({ text: "", error: String(e) });
      }
    });
    return true;
  }
  return false;
});
