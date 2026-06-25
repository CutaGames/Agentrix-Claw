// Test the deployed backend's testProvider endpoint for copilot-subscription models
// This simulates what the mobile app does when user clicks "测试"

async function getCopilotToken(githubToken) {
  const resp = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: { 'Authorization': `token ${githubToken}`, 'User-Agent': 'GithubCopilot/1.0' },
  });
  if (!resp.ok) throw new Error(`Failed: ${resp.status}`);
  return (await resp.json()).token;
}

async function main() {
  const fs = require('fs');
  const ghToken = JSON.parse(fs.readFileSync('/tmp/github_token.txt', 'utf8')).token;
  const copilotToken = await getCopilotToken(ghToken);
  console.log('Got fresh Copilot token\n');

  // Get user's auth token from the Agentrix API
  // We'll call the backend test endpoint directly
  const BASE_API = 'https://agentrix.top/api';

  // Test models via our backend
  const testModels = [
    'copilot-sub-claude-sonnet-4.6',
    'copilot-sub-claude-opus-4.6',
    'copilot-sub-gpt-5.4',
    'copilot-sub-gpt-5.4-mini',
    'copilot-sub-claude-haiku-4.5',
    'copilot-sub-gemini-3.1-pro',
    'copilot-sub-gemini-3-flash',
    'copilot-sub-gemini-2.5-pro',
    'copilot-sub-gpt-4.1',
    'copilot-sub-gpt-5-mini',
  ];

  // Call our backend testProvider endpoint directly on localhost
  console.log('=== Testing via backend testProvider API (localhost:3000) ===\n');
  
  for (const model of testModels) {
    try {
      const start = Date.now();
      const resp = await fetch('http://localhost:3000/api/ai-providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'copilot-subscription',
          model: model,
          apiKey: copilotToken,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const elapsed = Date.now() - start;
      
      if (resp.ok) {
        const data = await resp.json();
        console.log(`  ✅ ${model.padEnd(35)} ${String(elapsed).padStart(6)}ms -> ${JSON.stringify(data).substring(0, 80)}`);
      } else {
        const errText = await resp.text();
        console.log(`  ❌ ${model.padEnd(35)} ${String(elapsed).padStart(6)}ms -> HTTP ${resp.status}: ${errText.substring(0, 150)}`);
      }
    } catch (e) {
      console.log(`  ❌ ${model.padEnd(35)} -> ${e.message}`);
    }
  }
}

main().catch(e => console.error('Fatal:', e));
