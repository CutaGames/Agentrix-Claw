# Agentrix — Chrome Web Store Submission

Version: **0.1.0** · Package: `agentrix-extension-v0.1.0.zip` (12 KB)

## Store Listing Fields

### Name
`Agentrix — AI Agent Sidebar`

### Short description (≤132 chars)
`Open Agentrix in a side panel: chat with your AI agents, summarize any page, run skills — Ctrl+Shift+A from anywhere.`

### Detailed description
```
Agentrix is the open economy where AI agents work, trade, and grow. This
extension brings Agentrix into a side panel inside Chrome so you can:

• Chat with your Agentrix agents while you browse — no tab switching.
• Summarize the current page in 5 bullets and 1 takeaway.
• Right-click selected text → "Ask Agentrix about ..." for instant context.
• Pin a model or let Auto routing pick the cheapest adequate one.
• Open the sidebar from anywhere with Ctrl+Shift+A (Cmd+Shift+A on Mac).

Requires a free Agentrix account at https://agentrix.top — paste an API
token from your account once and you're done.

Agentrix is the only AI assistant where the agents you hire can hire other
agents, settle on open protocols (X402 / ERC-8004 / A2A), and earn across
web, mobile, desktop, and wearables.
```

### Category
Productivity

### Language
English

### Permissions justification (paste into the form)
| Permission | Justification |
|---|---|
| `sidePanel` | Required to render the Agentrix sidebar UI inside the browser. |
| `storage` | Stores the user's API token and locale preference locally. |
| `activeTab` | Used when the user invokes "Summarize this page" to read the visible tab content. |
| `scripting` | Injects a one-shot reader function (`document.body.innerText`) only when the user explicitly asks to summarize. |
| `contextMenus` | Adds the right-click "Ask Agentrix about \"…\"" menu item. |
| `host_permissions: agentrix.top` | Calls Agentrix backend (`/api/claude/chat`) for streaming chat. |

### Single purpose
> Bring the Agentrix AI workspace into a Chrome side panel so users can
> chat, summarize the active page, and invoke Agentrix skills from any tab.

### Privacy policy URL
`https://agentrix.top/legal/privacy`

### Homepage URL
`https://agentrix.top`

### Support URL
`https://agentrix.top/support` or `mailto:support@agentrix.top`

## Required graphics (must produce before submission)

| Asset | Size | Source |
|---|---|---|
| Store icon | 128×128 PNG | `extensions/chrome/icons/icon128.png` ✓ already generated |
| Small promo tile | 440×280 PNG | TODO — design simple gradient + "Agentrix Sidebar" text |
| Marquee promo tile (optional) | 1400×560 | optional |
| Screenshots (≥1, max 5) | 1280×800 or 640×400 | Capture sidepanel against a real page (e.g. github.com), 3 images recommended |

## Submission steps
1. Go to https://chrome.google.com/webstore/devconsole/ (one-time $5 dev fee).
2. Click **New item**, upload `agentrix-extension-v0.1.0.zip`.
3. Paste the listing fields above.
4. Upload icons + screenshots.
5. Set visibility: **Public** (or Unlisted while testing).
6. Submit for review (typically 1–3 business days).

## Post-publish
- Replace placeholder support URL with a real form.
- Add the CWS install link to:
  - `frontend/components/marketing/MarketingFooter.tsx` (link list)
  - Landing page hero CTA secondary
  - `extensions/chrome/README.md`

## Versioning
Bump `manifest.json.version` for every store submission. Reserve `0.1.x`
for pre-launch iterations; jump to `0.2.0` once the listing is live.
