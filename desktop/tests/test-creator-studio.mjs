/**
 * Creator Studio E2E Smoke Test
 * Injects auth token → opens Creator Studio → tests Poster/PetCreator/Wardrobe
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';

const token = readFileSync('tests/.e2e-token.txt', 'utf8').trim();
console.log('Token loaded:', token.substring(0, 30) + '...');

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });

try {
  await page.goto('http://localhost:1420');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // Inject auth token into localStorage (bypass login)
  await page.evaluate((t) => {
    localStorage.setItem('agentrix_token', t);
    localStorage.setItem('agentrix_auth', JSON.stringify({ token: t, user: { id: 'e2e-test', email: 'e2e@test.com' } }));
    // Skip onboarding (key must be "1" not "true")
    localStorage.setItem('agentrix_onboarded', '1');
  }, token);

  // Reload to pick up the token
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4000);

  const pageText = await page.evaluate(() => document.body.innerText);
  const isLoggedIn = !pageText.includes('扫码') && !pageText.includes('登录');
  console.log('✅ App loaded, logged in:', isLoggedIn);
  console.log('   Page preview:', pageText.replace(/\n/g, ' | ').substring(0, 120));

  // === Test 1: Open Creator Studio ===
  console.log('\n--- Test 1: Creator Studio ---');
  await page.evaluate(() => { window.dispatchEvent(new CustomEvent('agentrix:open-creator-studio')); });
  await page.waitForTimeout(1500);
  
  let text = await page.evaluate(() => document.body.innerText);
  const studioOpen = text.includes('Creator Studio') || text.includes('Pet Creator');
  console.log('Creator Studio opened:', studioOpen);

  if (studioOpen) {
    console.log('  Tabs found:', 
      ['Pet Creator', 'Poster', 'Video', 'Wardrobe', 'Mimic']
        .filter(t => text.includes(t)).join(', '));
  }

  // === Test 2: Poster Workshop ===
  console.log('\n--- Test 2: Poster Workshop ---');
  const posterBtn = page.locator('button:has-text("Poster")').first();
  if (await posterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await posterBtn.click({ force: true });
    await page.waitForTimeout(1500);
    text = await page.evaluate(() => document.body.innerText);
    const hasPoster = text.includes('海报工坊') || text.includes('模板') || text.includes('Poster Workshop');
    console.log('  PosterWorkshop loaded:', hasPoster);
    if (hasPoster) {
      console.log('  Has template selector:', text.includes('路演') || text.includes('社交'));
      console.log('  Has export button:', text.includes('导出') || text.includes('PNG'));
      console.log('  Has title input:', text.includes('标题') || text.includes('Agentrix'));
    }
  } else {
    console.log('  Poster button not visible');
  }

  // === Test 3: PetCreator ===
  console.log('\n--- Test 3: Pet Creator ---');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.dispatchEvent(new CustomEvent('agentrix:open-pet-creator')); });
  await page.waitForTimeout(1500);
  
  text = await page.evaluate(() => document.body.innerText);
  const hasPetCreator = text.includes('创建专属萌宠') || text.includes('Pet Creator') || text.includes('生成模式');
  console.log('  PetCreator opened:', hasPetCreator);
  if (hasPetCreator) {
    console.log('  Has text mode:', text.includes('文字') || text.includes('text'));
    console.log('  Has image mode:', text.includes('图片') || text.includes('image'));
    console.log('  Has breed mode:', text.includes('繁殖') || text.includes('breed'));
    console.log('  Has submit button:', text.includes('开始生成') || text.includes('Submit'));
    console.log('  Has variant button:', text.includes('形态变体') || text.includes('variant'));
  }

  // === Test 4: Wardrobe + Marketplace Listing ===
  console.log('\n--- Test 4: Wardrobe ---');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.dispatchEvent(new CustomEvent('agentrix:open-wardrobe')); });
  await page.waitForTimeout(1500);
  
  text = await page.evaluate(() => document.body.innerText);
  const hasWardrobe = text.includes('衣柜') || text.includes('Wardrobe');
  console.log('  Wardrobe opened:', hasWardrobe);
  if (hasWardrobe) {
    console.log('  Has create button:', text.includes('创建新皮肤'));
    console.log('  Has market button:', text.includes('浏览市场') || text.includes('Market'));
    console.log('  Has soul button:', text.includes('切换灵魂'));
    // Check for listing button (only on generated skins)
    console.log('  Has listing capability:', text.includes('上架') || text.includes('list'));
  }

  // === Test 5: Check mobile build ===
  console.log('\n--- Mobile Build Status ---');
  // (checked separately)

  console.log('\n=== CREATOR STUDIO SMOKE TEST COMPLETE ===');
  
} catch (err) {
  console.error('❌ Test failed:', err.message);
} finally {
  await browser.close();
}
