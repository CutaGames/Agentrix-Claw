const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', (msg) => console.log('CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

  await page.goto('http://127.0.0.1:3000/?e2e=voice-ui', {
    waitUntil: 'networkidle',
    timeout: 120000,
  });

  await page.waitForTimeout(2000);
  const mode = process.argv[2] || 'ball';
  const ball = page.locator('[data-testid="voice-floating-ball"]');
  const ballCore = page.locator('[data-testid="voice-floating-ball-core"]');
  const chatCta = page.locator('[data-testid="agent-console-chat-cta"]');
  console.log('BEFORE_TESTIDS', await page.locator('[data-testid]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid'))));

  if (mode === 'cta') {
    await chatCta.click({ force: true });
  } else if (mode === 'core') {
    await ballCore.click({ force: true });
  } else {
    await ball.click({ force: true });
  }

  await page.waitForTimeout(4000);

  console.log('MODE', mode);
  console.log('AFTER_URL', page.url());
  console.log('AFTER_TEXT', (await page.locator('body').innerText()).slice(0, 2500));
  console.log('AFTER_TESTIDS', await page.locator('[data-testid]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid'))));

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});