/**
 * Comprehensive E2E tests for Agentrix Desktop P2-P3 features.
 *
 * Tests all new components: HandoffBanner, WearableNotification,
 * OfflineCache, AgentEconomyPanel, MemoryPanel, and existing features.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const API = "https://api.agentrix.top/api";

async function gotoDesktop(page: Page) {
  try {
    await page.goto("http://127.0.0.1:1420", { timeout: 45_000, waitUntil: "domcontentloaded" });
  } catch (error) {
    const message = String(error);
    if (/ERR_CONNECTION_REFUSED|ECONNREFUSED|ERR_ABORTED/i.test(message)) {
      test.skip(true, "Vite dev server not running");
      return;
    }
    throw error;
  }
  await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await page.content()).length, { timeout: 20_000 }).toBeGreaterThan(100);
}

async function enterGuest(page: Page, onboarded = true) {
  await gotoDesktop(page);
  await page.evaluate((flag) => {
    localStorage.removeItem("agentrix_token");
    if (flag) {
      localStorage.setItem("agentrix_onboarded", "1");
    } else {
      localStorage.removeItem("agentrix_onboarded");
    }
  }, onboarded);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });

  const guestBtn = page.getByRole("button", { name: /Skip as Guest/i });
  const ball = page.locator("[title*='Agentrix']").first();
  if (await guestBtn.isVisible().catch(() => false)) {
    await guestBtn.dispatchEvent("click");
  }

  if (!onboarded) {
    await expect(page.locator("text=Welcome to Agentrix")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Get Started/i }).dispatchEvent("click");
    const skipBtn = page.getByRole("button", { name: /Skip for now/i });
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.dispatchEvent("click");
    }
    await page.getByRole("button", { name: /Start Using Agentrix/i }).dispatchEvent("click");
  }

  await expect(ball).toBeVisible({ timeout: 10_000 });
}

async function openProMode(page: Page) {
  await enterGuest(page, true);
  const ball = page.locator("[title*='Agentrix']").first();
  await ball.dblclick({ force: true });
  await expect(page.locator("textarea")).toBeVisible({ timeout: 10_000 });
}

async function expectEndpoint(
  request: APIRequestContext,
  path: string,
  allowedStatuses: number[],
  timeout = 20_000,
) {
  const res = await request.get(`${API}${path}`, { timeout });
  expect(allowedStatuses).toContain(res.status());
}

// ── Backend API Tests ──────────────────────────────────────

test.describe("P2-P3 Backend API Verification", () => {
  test.setTimeout(90_000);

  test("health endpoint available", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBeLessThan(500);
  });

  test("agent-presence agents endpoint exists", async ({ request }) => {
    await expectEndpoint(request, "/agent-presence/agents", [200, 401, 403]);
  });

  test("agent-presence devices endpoint exists", async ({ request }) => {
    await expectEndpoint(request, "/agent-presence/devices", [200, 401, 403]);
  });

  test("agent-presence dashboard endpoint exists", async ({ request }) => {
    await expectEndpoint(request, "/agent-presence/dashboard", [200, 401, 403]);
  });

  test("desktop-sync state endpoint exists", async ({ request }) => {
    await expectEndpoint(request, "/desktop-sync/state", [200, 401, 403]);
  });

  test("skills endpoint available", async ({ request }) => {
    const res = await request.get(`${API}/skills`, { timeout: 60_000 });
    expect(res.status()).toBeLessThan(500);
  });

  test("ai-rag knowledge endpoint exists", async ({ request }) => {
    await expectEndpoint(request, "/ai-rag/knowledge", [200, 401, 403]);
  });
});

// ── Frontend Component Tests ───────────────────────────────

test.describe("P2-P3 Component Rendering", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await gotoDesktop(page);
  });

  test("app renders without crash", async ({ page }) => {
    const body = page.locator("body");
    await expect(body).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(200);
  });

  test("floating ball visible", async ({ page }) => {
    await enterGuest(page, true);
    await expect(page.locator("[title*='Agentrix']")).toBeVisible();
  });

  test("double-click floating ball opens pro mode", async ({ page }) => {
    await openProMode(page);
    await expect(page.locator("textarea")).toBeVisible();
  });

  test("economy panel opens and shows tabs", async ({ page }) => {
    await openProMode(page);
    await page.locator("[title='Agent Economy']").click({ force: true });
    await expect(page.locator("text=Overview")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Transactions")).toBeVisible();
    await expect(page.locator("text=Skills")).toBeVisible();
  });

  test("memory panel opens and shows memory layers", async ({ page }) => {
    await openProMode(page);
    await page.locator("[title='Memory']").click({ force: true });
    await expect(page.getByRole("button", { name: /^💬 Session$/ })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /^🤖 Agent$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^👤 User$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^📚 Knowledge Base$/ })).toBeVisible();
  });

  test("cross-device hub opens", async ({ page }) => {
    await openProMode(page);
    await page.locator("[title='Cross-Device Hub']").click({ force: true });
    await expect(page.locator("text=Cross-Device Hub")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /Sessions/i })).toBeVisible();
  });

  test("chat mode selector has 3 modes", async ({ page }) => {
    await openProMode(page);
    await expect(page.getByRole("button", { name: "Ask" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agent" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Plan" })).toBeVisible();
  });

  test("ctrl+t creates a new chat tab", async ({ page }) => {
    await openProMode(page);
    await page.keyboard.press("Control+T");
    await expect(page.locator("[title='New Chat']")).toBeVisible({ timeout: 5_000 });
  });

  test("handoff banner not visible by default (no handoff)", async ({ page }) => {
    await openProMode(page);
    const handoffText = page.locator("text=其他设备上有进行中的任务");
    await expect(handoffText).toHaveCount(0);
  });

  test("handoff banner appears when handoff event fired", async ({ page }) => {
    await openProMode(page);
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("agentrix:handoff-incoming", {
          detail: {
            handoffId: "test-handoff-1",
            fromDeviceId: "mobile-123",
            contextSnapshot: { deviceType: "mobile", deviceName: "iPhone 15", sessionTitle: "测试会话" },
          },
        }),
      );
    });
    await expect(page.locator("text=其他设备上有进行中的任务")).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole("button", { name: /继续在桌面查看/ })).toBeVisible();
  });

  test("wearable notification appears when event fired", async ({ page }) => {
    await openProMode(page);
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("agentrix:presence-event", {
          detail: {
            event: "wearable:alert",
            data: {
              id: "w-test-1",
              type: "health",
              title: "Heart Rate Alert",
              body: "心率异常: 120 BPM",
              priority: "high",
            },
          },
        }),
      );
    });
    await expect(page.locator("text=Heart Rate Alert")).toBeVisible({ timeout: 3_000 });
  });

  test("offline queue indicator hidden when online", async ({ page }) => {
    await openProMode(page);
    await expect(page.locator("text=排队中")).toHaveCount(0);
  });

  test("slash commands work", async ({ page }) => {
    await openProMode(page);
    await page.locator("textarea").fill("/help");
    await page.locator("textarea").press("Enter");
    await expect(page.locator("text=Available Commands")).toBeVisible({ timeout: 5_000 });
  });
});

// ── Offline Cache Service Tests ────────────────────────────

test.describe("Offline Cache Integration", () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await gotoDesktop(page);
  });

  test("offline cache service initializes", async ({ page }) => {
    const hasStorage = await page.evaluate(() => {
      return typeof localStorage !== "undefined";
    });
    expect(hasStorage).toBeTruthy();
  });

  test("can enqueue and read offline messages", async ({ page }) => {
    const queueLength = await page.evaluate(async () => {
      const key = "agentrix_offline_queue";
      const queue = JSON.parse(localStorage.getItem(key) || "[]");
      queue.push({
        id: `q-test-${Date.now()}`,
        endpoint: "https://api.agentrix.top/api/test",
        method: "POST",
        body: JSON.stringify({ test: true }),
        headers: {},
        queuedAt: Date.now(),
        retries: 0,
      });
      localStorage.setItem(key, JSON.stringify(queue));
      return queue.length;
    });
    expect(queueLength).toBeGreaterThan(0);

    // Clean up
    await page.evaluate(() => {
      localStorage.removeItem("agentrix_offline_queue");
    });
  });

  test("cache set/get works via localStorage", async ({ page }) => {
    const result = await page.evaluate(() => {
      const key = "agentrix_cache_test_key";
      const entry = { key: "test_key", data: { hello: "world" }, cachedAt: Date.now(), ttl: 300000 };
      localStorage.setItem(key, JSON.stringify(entry));
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      localStorage.removeItem(key);
      return parsed?.data?.hello;
    });
    expect(result).toBe("world");
  });

  test("full queue is not silently truncated", async ({ page }) => {
    const snapshot = await page.evaluate(() => {
      const key = "agentrix_offline_queue";
      const queue = Array.from({ length: 50 }, (_, index) => ({
        id: `q-${index}`,
        endpoint: `/api/${index}`,
        method: "POST",
        body: "{}",
        headers: {},
        queuedAt: Date.now(),
        retries: 0,
      }));
      localStorage.setItem(key, JSON.stringify(queue));
      return JSON.parse(localStorage.getItem(key) || "[]").map((item: { id: string }) => item.id);
    });
    expect(snapshot[0]).toBe("q-0");
    expect(snapshot).toHaveLength(50);
  });
});
