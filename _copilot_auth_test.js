// GitHub Copilot Device Flow Auth + Model Testing
// Step 1: Device flow to get GitHub OAuth token
// Step 2: Exchange for Copilot API token
// Step 3: Test all models

const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const SCOPES = 'read:user';

async function deviceFlowAuth() {
  // Step 1: Request device code
  console.log('=== Step 1: Requesting device code ===');
  const codeResp = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      scope: SCOPES,
    }),
  });

  if (!codeResp.ok) {
    throw new Error(`Device code request failed: ${codeResp.status} ${await codeResp.text()}`);
  }

  const codeData = await codeResp.json();
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  请在浏览器中打开：                           ║');
  console.log(`║  ${codeData.verification_uri.padEnd(42)}║`);
  console.log('║                                              ║');
  console.log(`║  输入代码：  ${codeData.user_code.padEnd(32)}║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  // Step 2: Poll for access token
  console.log('等待授权中...');
  const interval = (codeData.interval || 5) * 1000;
  let accessToken = null;

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, interval));

    const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: COPILOT_CLIENT_ID,
        device_code: codeData.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const tokenData = await tokenResp.json();

    if (tokenData.access_token) {
      accessToken = tokenData.access_token;
      console.log(`✅ 授权成功! Token: ${accessToken.substring(0, 10)}...`);
      break;
    }

    if (tokenData.error === 'authorization_pending') {
      process.stdout.write('.');
      continue;
    }

    if (tokenData.error === 'slow_down') {
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    if (tokenData.error === 'expired_token') {
      throw new Error('Device code expired. Please retry.');
    }

    if (tokenData.error === 'access_denied') {
      throw new Error('Authorization denied by user.');
    }

    throw new Error(`Unexpected error: ${JSON.stringify(tokenData)}`);
  }

  if (!accessToken) throw new Error('Timeout waiting for authorization');
  return accessToken;
}

async function getCopilotToken(githubToken) {
  console.log('\n=== Step 2: Getting Copilot API token ===');
  const resp = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      'Authorization': `token ${githubToken}`,
      'User-Agent': 'GithubCopilot/1.0',
    },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get Copilot token: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  console.log(`✅ Copilot token obtained, expires: ${new Date(data.expires_at * 1000).toISOString()}`);
  return data.token;
}

async function testModels(copilotToken) {
  const BASE = 'https://api.individual.githubcopilot.com';

  // List available models
  console.log('\n=== Step 3: Listing available models ===');
  const headers = {
    'Authorization': `Bearer ${copilotToken}`,
    'Editor-Version': 'vscode/1.100.0',
    'Editor-Plugin-Version': 'copilot/1.300.0',
    'Copilot-Integration-Id': 'vscode-chat',
    'User-Agent': 'GithubCopilot/1.300.0',
  };
  const modelsResp = await fetch(`${BASE}/models`, { headers });

  if (!modelsResp.ok) {
    console.error('Failed to list models:', modelsResp.status, await modelsResp.text());
    return;
  }

  const modelsData = await modelsResp.json();
  const modelIds = (modelsData.data || []).map(m => m.id).sort();
  console.log(`Found ${modelIds.length} models:`);
  modelIds.forEach(m => console.log(`  - ${m}`));

  // Test user's key models
  const testModels = [
    // Premium models user cares about
    'claude-sonnet-4.6', 'claude-opus-4.6',
    'gpt-5.4', 'gpt-5.4-mini',
    'claude-haiku-4.5',
    'gemini-3.1-pro-preview', 'gemini-3-flash-preview',
    'gemini-2.5-pro',
    // Free/base models
    'gpt-4.1', 'gpt-5-mini',
    'claude-sonnet-4', 'claude-sonnet-4.5',
  ];

  console.log('\n=== Step 4: Testing chat/completions ===');
  const results = { pass: [], fail: [] };

  for (const model of testModels) {
    const inList = modelIds.includes(model);
    try {
      const start = Date.now();
      const resp = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say hello' }],
        }),
        signal: AbortSignal.timeout(20000),
      });

      const elapsed = Date.now() - start;
      if (resp.ok) {
        const data = await resp.json();
        const reply = data.choices?.[0]?.message?.content?.substring(0, 50) || '';
        console.log(`  ✅ ${model.padEnd(30)} ${String(elapsed).padStart(5)}ms [listed=${inList}] "${reply}"`);
        results.pass.push(model);
      } else {
        const errText = await resp.text();
        console.log(`  ❌ ${model.padEnd(30)} ${String(elapsed).padStart(5)}ms [listed=${inList}] HTTP ${resp.status}: ${errText.substring(0, 120)}`);
        results.fail.push({ model, error: `HTTP ${resp.status}`, inList });
      }
    } catch (e) {
      console.log(`  ❌ ${model.padEnd(30)}       [listed=${inList}] ${e.message}`);
      results.fail.push({ model, error: e.message, inList });
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`✅ Passed: ${results.pass.length} — ${results.pass.join(', ')}`);
  console.log(`❌ Failed: ${results.fail.length} — ${results.fail.map(f => `${f.model}(${f.error})`).join(', ')}`);

  // Write token to file for reuse
  require('fs').writeFileSync('/tmp/copilot_token.json', JSON.stringify({
    token: copilotToken,
    models: modelIds,
    results,
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log('\nResults saved to /tmp/copilot_token.json');
}

async function main() {
  // Check if we have a saved github token
  const fs = require('fs');
  let githubToken;
  try {
    const saved = JSON.parse(fs.readFileSync('/tmp/github_token.txt', 'utf8'));
    githubToken = saved.token;
    console.log(`Using saved GitHub token: ${githubToken.substring(0, 10)}...`);
  } catch {
    githubToken = await deviceFlowAuth();
    fs.writeFileSync('/tmp/github_token.txt', JSON.stringify({ token: githubToken }));
  }
  const copilotToken = await getCopilotToken(githubToken);
  await testModels(copilotToken);
}

main().catch(e => console.error('Fatal:', e.message));
