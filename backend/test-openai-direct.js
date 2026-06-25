const fetch = require('node-fetch');

// 测试 OpenAI (通过 api2d 代理)
const apiKey = 'fk235761-wCrllyRS6SkvzeLZrs4tuqTqIzjBNgG3';
const url = 'https://openai.api2d.net/v1/chat/completions';

fetch(url, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'user', content: '你好，请用一句话介绍自己' }
    ]
  })
})
.then(r => r.json())
.then(data => {
  if (data.error) {
    console.log('❌ OpenAI错误:', JSON.stringify(data.error, null, 2));
  } else if (data.choices && data.choices[0]) {
    console.log('✅ OpenAI成功响应:', data.choices[0].message.content);
  } else {
    console.log('未知响应:', JSON.stringify(data, null, 2));
  }
})
.catch(err => console.log('❌ 请求失败:', err.message));
