// Test GPT-5.4 via the /responses endpoint (new OpenAI API)
const fs = require('fs');
const saved = JSON.parse(fs.readFileSync('/tmp/copilot_token.json', 'utf8'));

async function getCopilotToken(githubToken) {
  const resp = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      'Authorization': `token ${githubToken}`,
      'User-Agent': 'GithubCopilot/1.0',
    },
  });
  if (!resp.ok) throw new Error(`Failed: ${resp.status}`);
  const data = await resp.json();
  return data.token;
}

async function main() {
  // Get fresh Copilot token
  const ghToken = JSON.parse(fs.readFileSync('/tmp/github_token.txt', 'utf8')).token;
  const token = await getCopilotToken(ghToken);
  console.log('Got Copilot token');

  const BASE = 'https://api.individual.githubcopilot.com';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Editor-Version': 'vscode/1.100.0',
    'Editor-Plugin-Version': 'copilot/1.300.0',
    'Copilot-Integration-Id': 'vscode-chat',
    'User-Agent': 'GithubCopilot/1.300.0',
  };

  const testModels = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.1', 'gpt-5.2'];

  // Test 1: /chat/completions (standard)
  console.log('\n=== Test via /chat/completions ===');
  for (const model of testModels) {
    try {
      const start = Date.now();
      const resp = await fetch(`${BASE}/chat/completions`, {
        method: 'POST', headers,
        body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] }),
        signal: AbortSignal.timeout(20000),
      });
      const elapsed = Date.now() - start;
      if (resp.ok) {
        const d = await resp.json();
        console.log(`  ✅ ${model} (${elapsed}ms) chat/completions OK: "${d.choices?.[0]?.message?.content?.substring(0, 40)}"`);
      } else {
        const err = await resp.text();
        console.log(`  ❌ ${model} (${elapsed}ms) chat/completions: ${err.substring(0, 120)}`);
      }
    } catch (e) { console.log(`  ❌ ${model}: ${e.message}`); }
  }

  // Test 2: /responses (new OpenAI API format)
  console.log('\n=== Test via /responses (new API) ===');
  for (const model of testModels) {
    try {
      const start = Date.now();
      const resp = await fetch(`${BASE}/responses`, {
        method: 'POST', headers,
        body: JSON.stringify({
          model,
          input: 'Say hello in one word',
          max_output_tokens: 50,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const elapsed = Date.now() - start;
      if (resp.ok) {
        const d = await resp.json();
        const text = d.output?.[0]?.content?.[0]?.text || d.output_text || JSON.stringify(d).substring(0, 100);
        console.log(`  ✅ ${model} (${elapsed}ms) /responses OK: "${text.substring(0, 60)}"`);
      } else {
        const err = await resp.text();
        console.log(`  ❌ ${model} (${elapsed}ms) /responses: ${err.substring(0, 150)}`);
      }
    } catch (e) { console.log(`  ❌ ${model}: ${e.message}`); }
  }

  // Test 3: /chat/completions with streaming
  console.log('\n=== Test via /chat/completions stream=true ===');
  for (const model of ['gpt-5.4', 'gpt-5.4-mini']) {
    try {
      const start = Date.now();
      const resp = await fetch(`${BASE}/chat/completions`, {
        method: 'POST', headers,
        body: JSON.stringify({
          model, max_tokens: 10, stream: true,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        signal: AbortSignal.timeout(20000),
      });
      const elapsed = Date.now() - start;
      if (resp.ok) {
        const text = await resp.text();
        console.log(`  ✅ ${model} (${elapsed}ms) stream OK: ${text.substring(0, 200)}`);
      } else {
        const err = await resp.text();
        console.log(`  ❌ ${model} (${elapsed}ms) stream: ${err.substring(0, 150)}`);
      }
    } catch (e) { console.log(`  ❌ ${model}: ${e.message}`); }
  }
}

main().catch(e => console.error('Fatal:', e));
