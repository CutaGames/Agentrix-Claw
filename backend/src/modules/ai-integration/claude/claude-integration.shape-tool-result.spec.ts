/**
 * Unit tests for ClaudeIntegrationService.shapeToolResultForModel().
 *
 * These tests pin the contract that the cloud agent loop relies on:
 *
 *   1. When the desktop returns a real PNG screenshot
 *      (`{image_data_url: 'data:image/png;base64,...'}`), the result is
 *      shaped into Anthropic multimodal content blocks
 *      `[{type:'image', source:{...}}, {type:'text', ...}]` so Bedrock
 *      Claude can actually SEE the screenshot and stop hallucinating.
 *
 *   2. When the desktop call fails (timeout / no client / error JSON),
 *      the result is shaped into a LOUD plain-text "Computer Use FAILURE"
 *      string that explicitly forbids the model from pretending the
 *      operation succeeded.
 *
 * We instantiate the service via reflection (`new (ClaudeIntegrationService
 * as any)()`) and only invoke the private `shapeToolResultForModel` method —
 * none of the service's heavy DB/HTTP collaborators are touched.
 */
import { ClaudeIntegrationService } from './claude-integration.service';

type ShapedContent = string | any[];

function callShape(
  svc: ClaudeIntegrationService,
  toolName: string,
  result: any,
): ShapedContent {
  return (svc as any).shapeToolResultForModel(toolName, result);
}

describe('ClaudeIntegrationService.shapeToolResultForModel', () => {
  const svc = Object.create(ClaudeIntegrationService.prototype) as ClaudeIntegrationService;

  // 1×1 transparent PNG (valid base64) for the happy path.
  const TINY_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8AAAAMBAQAY3Y2wAAAAAElFTkSuQmCC';
  const DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

  describe('computer_use_screenshot — happy path', () => {
    it('returns multimodal [image, text] when image_data_url is present', () => {
      const shaped = callShape(svc, 'computer_use_screenshot', {
        image_data_url: DATA_URL,
        width: 1920,
        height: 1080,
        monitor_index: 0,
      });
      expect(Array.isArray(shaped)).toBe(true);
      const arr = shaped as any[];
      expect(arr).toHaveLength(2);
      expect(arr[0].type).toBe('image');
      expect(arr[0].source).toMatchObject({
        type: 'base64',
        media_type: 'image/png',
        data: TINY_PNG_BASE64,
      });
      expect(arr[1].type).toBe('text');
      expect(arr[1].text).toMatch(/Screenshot 1920x1080/);
      // Anti-hallucination guard rail must be in the text block.
      expect(arr[1].text).toMatch(/do NOT invent/);
    });

    it('accepts a JSON-stringified payload', () => {
      const shaped = callShape(
        svc,
        'computer_use_screenshot',
        JSON.stringify({
          image_data_url: DATA_URL,
          width: 800,
          height: 600,
          monitor_index: 1,
        }),
      );
      expect(Array.isArray(shaped)).toBe(true);
      expect((shaped as any[])[0].source.data).toBe(TINY_PNG_BASE64);
    });

    it('falls back to png_base64 / base64 fields when image_data_url is missing', () => {
      // png_base64 fallback only kicks in for strings > 100 chars (defensive
      // length check; real screenshots are tens of kB+). Pad the tiny PNG.
      const PADDED = TINY_PNG_BASE64 + 'A'.repeat(20);
      const shaped = callShape(svc, 'computer_use_screenshot', {
        png_base64: PADDED,
        width: 1024,
        height: 768,
      });
      expect(Array.isArray(shaped)).toBe(true);
      expect((shaped as any[])[0].source.data).toBe(PADDED);
    });
  });

  describe('computer_use_* — failure paths must be LOUD', () => {
    it('shapes a timeout error into an explicit FAILURE string', () => {
      const shaped = callShape(svc, 'computer_use_screenshot', {
        error: '桌面端未响应（超时2分钟）。请确认桌面客户端已打开并登录。',
      });
      expect(typeof shaped).toBe('string');
      const text = shaped as string;
      expect(text).toMatch(/Computer Use FAILURE/);
      expect(text).toMatch(/computer_use_screenshot did NOT succeed/);
      expect(text).toMatch(/Do NOT pretend/);
    });

    it('shapes a JSON-stringified timeout error into FAILURE string', () => {
      const shaped = callShape(
        svc,
        'computer_use_screenshot',
        '{"error":"桌面端未响应（超时2分钟）。请确认桌面客户端已打开并登录。"}',
      );
      expect(typeof shaped).toBe('string');
      expect(shaped as string).toMatch(/Computer Use FAILURE/);
    });

    it('shapes a click failure (no image) into FAILURE string', () => {
      const shaped = callShape(svc, 'computer_use_click', {
        success: false,
        error: 'No active monitor',
      });
      expect(typeof shaped).toBe('string');
      expect(shaped as string).toMatch(/Computer Use FAILURE/);
      expect(shaped as string).toMatch(/computer_use_click did NOT succeed/);
    });

    it('shapes a screenshot result with no image and no error as FAILURE (defensive)', () => {
      // If desktop returned a malformed object missing both image and error,
      // we still must not let the model fabricate; force the failure path.
      const shaped = callShape(svc, 'computer_use_screenshot', { width: 0 });
      expect(typeof shaped).toBe('string');
      expect(shaped as string).toMatch(/Computer Use FAILURE/);
    });
  });

  describe('non-CU tools — unchanged passthrough', () => {
    it('returns string unchanged for desktop_read_file string result', () => {
      const shaped = callShape(svc, 'desktop_read_file', 'hello world');
      expect(shaped).toBe('hello world');
    });

    it('JSON.stringifies object result for non-CU tools', () => {
      const shaped = callShape(svc, 'web_search', { results: ['a', 'b'] });
      expect(typeof shaped).toBe('string');
      expect(shaped).toBe('{"results":["a","b"]}');
    });
  });
});
