/**
 * Agentrix Chrome Extension — sidepanel script.
 *
 * Minimal chat client that talks to the Agentrix backend over the existing
 * Claude/OpenClaw chat endpoints. Token is stored in chrome.storage.local;
 * if missing, the panel opens a login popup to https://agentrix.top/auth.
 */

const API_BASE = "https://api.agentrix.top/api";
const WEB_BASE = "https://agentrix.top";

const $ = (sel) => document.querySelector(sel);
const messagesEl = $("#messages");
const inputEl = $("#input");
const sendBtn = $("#send");

let token = null;

// ── boot ──────────────────────────────────────────────
(async function boot() {
  const stored = await chrome.storage.local.get(["agentrix_token"]);
  token = stored.agentrix_token || null;

  // If a context-menu pre-filled a prompt, use it.
  const session = await chrome.storage.session.get(["agentrix_pending_prompt"]);
  if (session.agentrix_pending_prompt) {
    inputEl.value = session.agentrix_pending_prompt;
    await chrome.storage.session.remove(["agentrix_pending_prompt"]);
    inputEl.focus();
  }

  if (!token) {
    appendBubble(
      "system",
      "请先登录 Agentrix。点击 🔑 登录，粘贴你的 token 后保存。",
    );
    addLoginButton();
  }

  bindUI();
})();

function bindUI() {
  sendBtn.addEventListener("click", () => sendCurrent());
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCurrent();
    }
  });
  document.querySelectorAll(".quick-tools button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const prompt = btn.dataset.prompt || btn.textContent.trim();
      const useCtx = prompt.includes("page") || prompt.includes("slides");
      if (useCtx) {
        const ctx = await chrome.runtime.sendMessage({ type: "agentrix:get-page-text" });
        const truncated = (ctx?.text || "").slice(0, 8000);
        inputEl.value = `${prompt}\n\n[Current page: ${ctx?.title || ""} — ${ctx?.url || ""}]\n${truncated}`;
      } else {
        inputEl.value = prompt;
      }
      sendCurrent();
    });
  });
  $("#btn-summarize").addEventListener("click", async () => {
    const ctx = await chrome.runtime.sendMessage({ type: "agentrix:get-page-text" });
    const truncated = (ctx?.text || "").slice(0, 8000);
    inputEl.value = `Summarize this page in 5 bullets and 1 takeaway:\n\n[${ctx?.title || ""}](${ctx?.url || ""})\n\n${truncated}`;
    sendCurrent();
  });
  $("#btn-open-web").addEventListener("click", () => chrome.tabs.create({ url: WEB_BASE }));
}

function addLoginButton() {
  const btn = document.createElement("button");
  btn.textContent = "🔑 Paste token to log in";
  btn.style.cssText =
    "background:#5B21B6;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;margin:8px auto;display:block;";
  btn.addEventListener("click", async () => {
    const value = prompt("Paste your Agentrix API token:");
    if (!value) return;
    token = value.trim();
    await chrome.storage.local.set({ agentrix_token: token });
    appendBubble("system", "Token saved. You can now chat.");
    btn.remove();
  });
  $(".empty")?.appendChild(btn);
}

function clearEmpty() {
  const emp = document.querySelector(".empty");
  if (emp) emp.remove();
}

function appendBubble(role, text) {
  clearEmpty();
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

async function sendCurrent() {
  const text = inputEl.value.trim();
  if (!text) return;
  if (!token) {
    appendBubble("system", "Token missing. Click the login button to set one.");
    return;
  }
  inputEl.value = "";
  sendBtn.disabled = true;
  appendBubble("user", text);
  const replyEl = appendBubble("assistant", "…");

  try {
    const res = await fetch(`${API_BASE}/claude/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }],
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      replyEl.textContent = `Error: HTTP ${res.status}`;
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const lines = frame.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (json === "[DONE]") continue;
          try {
            const parsed = JSON.parse(json);
            const delta =
              parsed.delta?.text ??
              parsed.choices?.[0]?.delta?.content ??
              parsed.text ??
              "";
            if (delta) {
              acc += delta;
              replyEl.textContent = acc;
              messagesEl.scrollTop = messagesEl.scrollHeight;
            }
          } catch {
            // ignore non-JSON keepalive
          }
        }
      }
    }
    if (!acc) replyEl.textContent = "(empty response)";
  } catch (e) {
    replyEl.textContent = `Error: ${e?.message || e}`;
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}
