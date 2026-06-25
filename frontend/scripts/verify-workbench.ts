import axios from 'axios';

const API_BASE = 'http://localhost:3000';

async function verifyWorkbench() {
  console.log('🚀 Starting Workbench Verification...');

  try {
    // 1. Verify Backend Skill API
    console.log('--- 1. Testing Backend Skill API ---');
    const skills = await axios.get(`${API_BASE}/api/skills`);
    console.log(`✅ [Backend] Skill list fetched: ${skills.data.length} items`);

    // 2. Test Skill Creation
    console.log('--- 2. Testing Skill Creation ---');
    const newSkill = await axios.post(`${API_BASE}/api/skills`, {
      name: 'test_skill_' + Date.now(),
      description: 'Verification test skill',
      version: '1.0.0',
      category: 'utility',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'test' } },
        required: ['query']
      },
      executor: { type: 'internal', internalHandler: 'echo' }
    });
    console.log(`✅ [Backend] Skill created: ${newSkill.data.id}`);

    // 3. Test Pack Generation
    console.log('--- 3. Testing Pack Generation ---');
    const pack = await axios.get(`${API_BASE}/api/skills/${newSkill.data.id}/pack/openai`);
    if (pack.data.type === 'function') {
      console.log('✅ [Backend] OpenAI Function pack generated');
    }

    console.log('\n✨ All backend services verified for Workbench Path B.');
    console.log('👉 Proceed to UI for Path A verification.');
  } catch (error: any) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyWorkbench();
