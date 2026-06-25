/**
 * Vitest setup — desktop unit tests.
 * - Mocks Tauri-only APIs that some service modules import at top level.
 * - Sets up a baseline window.fetch mock that individual tests can override.
 */
import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";

// Tauri APIs are not available in jsdom; mock the modules we touch.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
  emit: vi.fn(async () => undefined),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: { load: vi.fn(async () => ({ get: vi.fn(), set: vi.fn(), save: vi.fn() })) },
}));
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

beforeEach(() => {
  // Default fetch impl — tests should override.
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});
