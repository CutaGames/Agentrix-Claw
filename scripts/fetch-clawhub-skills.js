/**
 * Fetch all skills from ClawHub API and save as seed data.
 * Uses small page sizes and delays to avoid rate limiting.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Try both domains — www.clawhub.ai and clawhub.ai
const CLAWHUB_APIS = [
  'https://clawhub.ai/api/v1',
  'https://www.clawhub.ai/api/v1',
];
let CLAWHUB_API = CLAWHUB_APIS[0];
const PER_PAGE = 50;
const DELAY_MS = 3000; // 3s between requests
const MAX_PAGES = 200;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, {
      timeout: 15000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 Agentrix/2.0' },
    }, (res) => {
      // Follow redirects (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirect = res.headers.location;
        // Handle relative redirects
        if (redirect.startsWith('/')) {
          const u = new URL(url);
          redirect = `${u.protocol}//${u.host}${redirect}`;
        }
        return fetchUrl(redirect).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function fetchPage(cursor) {
  return new Promise(async (resolve, reject) => {
    let url = `${CLAWHUB_API}/skills?per_page=${PER_PAGE}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    try {
      const res = await fetchUrl(url);
      if (res.statusCode === 429) {
        reject(new Error(`429 Rate Limit`));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.body.slice(0, 200)}`));
        return;
      }
      try { resolve(JSON.parse(res.body)); } catch (e) { reject(e); }
    } catch (err) { reject(err); }
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const allItems = [];
  let cursor = null;
  let page = 0;
  let retries = 0;

  console.log('Starting ClawHub skill fetch...');

  while (page < MAX_PAGES) {
    page++;
    try {
      const resp = await fetchPage(cursor);
      const items = resp.items || [];
      if (items.length === 0) {
        console.log(`Page ${page}: No more items. Done.`);
        break;
      }
      allItems.push(...items);
      cursor = resp.nextCursor;
      console.log(`Page ${page}: +${items.length} = ${allItems.length} total${cursor ? '' : ' (no cursor, done)'}`);
      if (!cursor) break;
      retries = 0; // reset retries on success
      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`Page ${page} ERROR: ${err.message}`);
      if (err.message.includes('429') && retries < 3) {
        retries++;
        const backoff = 10000 * retries;
        console.log(`Rate limited - waiting ${backoff/1000}s (retry ${retries}/3)...`);
        await sleep(backoff);
        page--; // retry same page
        continue;
      }
      // Save what we have so far
      break;
    }
  }

  console.log(`\nTotal skills fetched: ${allItems.length}`);

  if (allItems.length > 0) {
    const outPath = path.join(__dirname, '..', 'backend', 'src', 'modules', 'openclaw-bridge', 'clawhub-snapshot.json');
    fs.writeFileSync(outPath, JSON.stringify(allItems, null, 0), 'utf8');
    console.log(`Saved to: ${outPath}`);
    console.log(`File size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
  } else {
    console.log('No skills fetched!');
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
