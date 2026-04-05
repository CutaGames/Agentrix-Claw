// Direct test: simulate exactly what our backend does for each model type
const fs = require('fs');

async function getCopilotToken(githubToken) {
  const resp = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: { 'Authorization': `token ${githubToken}`, 'User-Agent': 'GithubCopilot/1.0' },
  });
  if (!resp.ok) throw new Error(`Failed: ${resp.status}`);
  return (await resp.json()).token;
}

// Exact copy of our SUBSCRIPTION_MODEL_ALIASES logic
const ALIASES = {
  'copilot-sub-gpt-4.1': 'gpt-4.1',
  'copilot-sub-gpt-5-mini': 'gpt-5-mini',
  'copilot-sub-claude-haiku-4.5': 'claude-haiku-4.5',
  'copilot-sub-gpt-5.4-mini': 'gpt-5.4-mini',
  'copilot-sub-gpt-5.4': 'gpt-5.4',
  'copilot-sub-claude-sonnet-4.6': 'claude-sonnet-4.6',
  'copilot-sub-claude-opus-4.6': 'claude-opus-4.6',
  'copilot-sub-gemini-3-flash': 'gemini-3-flash-preview',
  'copilot-sub-gemini-3.1-pro': 'gemini-3.1-pro-preview',
  'copilot-sub-gemini-2.5-pro': 'gemini-2.5-pro',
};

async function main() {
  const ghToken = JSON.parse(fs.readFileSync('/tmp/github_token.txt', 'utf8')).token;
  const token = await getCopilotToken(ghToken);
  console.log('Got Copilot token\n');

  const BASE = 'https://api.individual.githubcopilot.com';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Editor-Version': 'vscode/1.100.0',
    'Editor-Plugin-Version': 'copilot/1.300.0',
    'Copilot-Integration-Id': 'vscode-chat',
  };

  console.log('=== Simulating backend testProvider + chatWithFunctions logic ===\n');

  for (const [appModel, resolvedModel] of Object.entries(ALIASES)) {
    const useResponsesApi = resolvedModel.includes('gpt-5.4');
    const endpoint = useResponsesApi ? '/responses' : '/chat/completions';
    
    try {
      const start = Date.now();
      let resp;
      
      if (useResponsesApi) {
        // Responses API path (what our new code does for GPT-5.4)
        resp = await fetch(`${BASE}/responses`, {
          method: 'POST', headers,
          body: JSON.stringify({
            model: resolvedModel,
            input: [{ role: 'user', content: 'Say hello in one word' }],
            max_output_tokens: 50,
            instructions: 'You are a helpful assistant.',
          }),
          signal: AbortSignal.timeout(20000),
        });
      } else {
        // Chat Completions path (existing code)
        resp = await fetch(`${BASE}/chat/completions`, {
          method: 'POST', headers,
          body: JSON.stringify({
            model: resolvedModel,
            max_tokens: 20,
            messages: [
              { role: 'system', content: 'You are a helpful assistant.' },
              { role: 'user', content: 'Say hello in one word' },
            ],
          }),
          signal: AbortSignal.timeout(20000),
        });
      }

      const elapsed = Date.now() - start;
      if (resp.ok) {
        const data = await resp.json();
        let reply;
        if (useResponsesApi) {
          reply = data.output_text || data.output?.[0]?.content?.[0]?.text || '';
        } else {
          reply = data.choices?.[0]?.message?.content || '';
        }
        console.log(`  ✅ ${appModel.padEnd(36)} -> ${resolvedModel.padEnd(22)} [${endpoint}] ${String(elapsed).padStart(5)}ms "${reply.substring(0, 40)}"`);
      } else {
        const err = await resp.text();
        console.log(`  ❌ ${appModel.padEnd(36)} -> ${resolvedModel.padEnd(22)} [${endpoint}] ${String(elapsed).padStart(5)}ms HTTP ${resp.status}: ${err.substring(0, 120)}`);
      }
    } catch (e) {
      console.log(`  ❌ ${appModel.padEnd(36)} -> ${resolvedModel.padEnd(22)} [${endpoint}] ${e.message}`);
    }
  }
}

main().catch(e => console.error('Fatal:', e));
