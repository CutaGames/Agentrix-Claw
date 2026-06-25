# Cloud Computer-Use screenshot shape — shipped 2026-05-17

## What broke

Cloud agent was hallucinating screen contents (Chrome / Google homepage)
even after calling `computer_use_screenshot` because Bedrock Claude was
receiving a 41-character text payload as `tool_result.content` instead
of the multimodal `[{type:'image',...}, {type:'text',...}]` array the
shape function was supposed to build.

PM2 log signature of the regression:
```
📝 tool_result[computer_use_screenshot]: text len=41
```

## TWO root causes found

### Root Cause 1 (commit `d278b509`): shapeToolResultForModel too strict
The 41 chars matched the JS `String.length` of the polling timeout error
JSON: `{"error":"桌面端未响应（超时2分钟）。请确认桌面客户端已打开并登录。"}`.
Desktop polling timed out → shape function fell through to JSON.stringify.

### Root Cause 2 (commit `e183d729`): handleBedrockChat serialized tool_result to text
**THE REAL BUG.** Even when `shapeToolResultForModel` correctly returned
`[{type:'image',...},{type:'text',...}]`, the follow-up message builder
at line ~1670 was doing:
```typescript
content: `Tool results:\n${truncatedResults.map(r => `Tool ${i}: ${r.content}`).join(...)}`
```
This serialized the multimodal array to `[object Object],[object Object]`
as a plain text user message. The model NEVER saw the image.

**Fix:** Build proper Anthropic Messages API format:
- Assistant message with `tool_use` blocks (matching IDs)
- User message with `tool_result` blocks (containing image+text content)

## E2E test result after fix

```
📸 tool_result[computer_use_screenshot]: blocks=[image,text], imgBytes=96
```
Model response: "深蓝色/深紫色背景，Windows任务栏，没有打开的窗口"
(No more Chrome/Google/手气不错 hallucination!)

## Test script

`scripts/test/e2e-cloud-screenshot.mjs` — full round-trip:
1. Mint JWT for real user
2. Register fake desktop device via heartbeat
3. Send "截图给我看看桌面" to stream endpoint
4. Poll for pending commands, complete with known PNG
5. Read SSE stream, check for hallucination markers

Run: `TEST_TOKEN=<jwt> node scripts/test/e2e-cloud-screenshot.mjs`

## Fix (commits `d278b509` + `e183d729`)

### Commit `d278b509` — Permissive image extraction + LOUD failure
`shapeToolResultForModel(toolName, result)`:

1. **Permissive image extraction** — recognize `image_data_url`,
   `imageDataUrl`, `data_url`, `dataUrl`, `image`, `screenshot`
   (data-URL strings) plus `png_base64` / `base64 + media_type` raw
   shapes.

2. **LOUD failure path** — when a `computer_use_*` call returns an
   `error` / `pending` / `success: false`, OR when a
   `computer_use_screenshot` call returns no extractable image, replace
   the body with an explicit string:
   `[Computer Use FAILURE] computer_use_screenshot did NOT succeed.`

3. **Anti-hallucination guard rail** — happy-path text block now reads
   `Describe ONLY what is visible in the image; do NOT invent windows,
   browsers, or apps that are not shown.`

### Commit `e183d729` — Proper Anthropic tool_result content blocks
`handleBedrockChat` follow-up message construction:

- Build `assistant` message with `[{type:'text',...}, {type:'tool_use', id, name, input}]`
- Build `user` message with `[{type:'tool_result', tool_use_id, content: [image, text]}]`
- IDs matched by index (toolResults[i].tool_use_id === assistantBlocks tool_use id)

This is the correct Anthropic Messages API format. Previously it was
a single text string that destroyed multimodal content.

Diagnostic logs `🔬 ${fnName} raw result: keys=[…] image_data_url.len=N`
and `📸 tool_result[fn]: blocks=[image,text], imgBytes=N` /
`📝 tool_result[fn]: text len=N` are still in to confirm shape on
production logs.

## Test contract

`backend/src/modules/ai-integration/claude/claude-integration.shape-tool-result.spec.ts`
pins 9 cases (image_data_url, JSON-stringified image, png_base64
fallback, timeout error string, JSON-stringified error string, click
failure, malformed payload defensive failure, non-CU tool string
passthrough, non-CU tool object stringification). Run with:

```
cd backend && npx jest --testPathPattern=claude-integration.shape --runInBand --no-coverage
```

## Why end-to-end automated test isn't possible from backend alone

`computer_use_screenshot` requires a running desktop client to actually
poll `/api/desktop-sync/commands/pending` and execute the Tauri
`computer_use_screenshot` invoke. The backend cannot synthesize a real
PNG from itself. A future test could mock the desktop sync repo's
`completeCommand` flow with a real-looking PNG and assert
`shapeToolResultForModel` produces the multimodal array — that's already
covered by the unit test above. End-to-end (real `/openclaw/proxy/<id>/stream`
call producing a real screenshot) requires a live desktop session.

## Known follow-ups

- Desktop polling timeout (2 min for non-`run-command`) is currently a
  hard wall; long screenshots / approval-gated CU calls may exceed it.
  If users keep hitting it, raise to 5 min.
- When `dto.context.enableComputerUse !== true` from the desktop side,
  the backend still falls through to a desktop-only tool set without
  CU. Confirm the desktop SettingsPanel toggle is wired and ON for
  users testing CU.
- Local model sidecar still under-resourced on weak hardware (Gemma
  1.7B, 200 s+ tool-decision latency reported). Hardware tier warning
  shipped in `9c8f9c4d` but not validated by user.
