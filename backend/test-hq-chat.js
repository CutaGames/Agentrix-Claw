
const axios = require('axios');

async function testChat() {
  try {
    console.log('Testing HQ Chat for Growth Agent (AGENT-GROWTH-001)...');
    const response = await axios.post('http://localhost:3005/api/hq/chat', {
      agentId: 'AGENT-GROWTH-001',
      messages: [{ role: 'user', content: 'Who are you?' }]
    });
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response) {
      console.error('Error Status:', error.response.status);
      console.error('Error Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testChat();
