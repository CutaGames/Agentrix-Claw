const axios = require('axios');

async function testChat() {
    const url = 'http://localhost:3005/api/hq/chat';
    const payload = {
        agentId: 'AGENT-GROWTH-001',
        messages: [
            { role: 'user', content: '你好，请帮我分析一下Agentrix的市场增长策略。' }
        ]
    };

    console.log('🚀 Sending chat request to Growth Agent (AGENT-GROWTH-001)...');
    try {
        const response = await axios.post(url, payload, {
            timeout: 60000 // 60 seconds
        });
        console.log('✅ Response received:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('❌ Chat request failed:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.log('Data:', error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

testChat();
