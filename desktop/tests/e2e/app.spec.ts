import { test, expect, type Page } from "@playwright/test";

async function gotoDesktop(page: Page) {
  try {
    await page.goto("http://127.0.0.1:1420/", { waitUntil: "domcontentloaded", timeout: 45_000 });
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

test.describe("Agentrix Desktop — Smoke Tests", () => {
  test("login panel renders without crash", async ({ page }) => {
    await gotoDesktop(page);
    await expect(page.getByRole("button", { name: /Skip as Guest/i })).toBeVisible();
  });

  test("guest onboarding reaches floating ball", async ({ page }) => {
    await enterGuest(page, false);
    await expect(page.locator("[title*='Agentrix']").first()).toBeVisible();
  });

  test("floating ball is visible for onboarded guest", async ({ page }) => {
    await enterGuest(page, true);
    await expect(page.locator("[title*='Agentrix']").first()).toBeVisible();
  });
});

test.describe("Agentrix Desktop — Chat Panel", () => {
  test("slash command /help shows command list", async ({ page }) => {
    await openProMode(page);
    await page.locator("textarea").fill("/help");
    await page.locator("textarea").press("Enter");
    await expect(page.locator("text=Available Commands")).toBeVisible({ timeout: 5_000 });
  });

  test("new chat button is available in pro mode", async ({ page }) => {
    await openProMode(page);
    await expect(page.locator("[title='New Chat']")).toBeVisible();
  });

  test("settings panel opens", async ({ page }) => {
    await openProMode(page);
    await page.locator("[title='Settings']").click();
    await expect(page.locator("text=Agentrix Desktop v0.1.1")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Agentrix Desktop — Error Boundary", () => {
  test("error boundary is not triggered on first render", async ({ page }) => {
    await gotoDesktop(page);
    await expect(page.locator("text=Something went wrong")).toHaveCount(0);
  });
});
