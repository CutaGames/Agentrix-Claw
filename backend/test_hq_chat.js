const axios = require('axios');

async function testChat() {
  const url = 'http://localhost:3005/api/hq/chat';
  const data = {
    agentId: 'AGENT-GROWTH-001',
    messages: [{ role: 'user', content: 'Who are you and what do you know about Agentrix?' }]
  };

  console.log('Testing HQ Chat via:', url);
  console.log('Data:', JSON.stringify(data));

  try {
    const response = await axios.post(url, data, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000 // 60s
    });
    console.log('SUCCESS!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response) {
      console.error('ERROR (Status):', error.response.status);
      console.error('ERROR (Data):', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('ERROR:', error.message);
    }
  }
}

testChat();
