require('dotenv').config();
const { edgeTTS } = require('./dist/modules/voice/adapters/edge-tts.adapter');

async function main() {
  // Test Chinese - should now use Polly Neural
  try {
    const buf = await edgeTTS('你好，我是你的智能助手，很高兴认识你。', 'zh-CN');
    console.log('Chinese TTS SUCCESS:', buf.length, 'bytes');
  } catch (err) {
    console.log('Chinese TTS FAILED:', err.message);
  }

  // Test English
  try {
    const buf = await edgeTTS('Hello, I am your AI assistant. Nice to meet you!', 'en-US');
    console.log('English TTS SUCCESS:', buf.length, 'bytes');
  } catch (err) {
    console.log('English TTS FAILED:', err.message);
  }
}

main();
