// Quick TTS test
require('dotenv').config();

console.log('DEEPGRAM key length:', process.env.DEEPGRAM_API_KEY?.length);
console.log('DEEPGRAM key starts:', process.env.DEEPGRAM_API_KEY?.substring(0, 8));
console.log('DEEPGRAM key ends:', process.env.DEEPGRAM_API_KEY?.substring(process.env.DEEPGRAM_API_KEY.length - 8));

const { edgeTTS } = require('./dist/modules/voice/adapters/edge-tts.adapter');

async function main() {
  try {
    const buf = await edgeTTS('Hello, this is a test.', 'en-US');
    console.log('English SUCCESS:', buf.length, 'bytes');
  } catch (err) {
    console.log('English FAILED:', err.message || err);
  }
  try {
    const buf = await edgeTTS('你好，这是一个测试。', 'zh-CN');
    console.log('Chinese SUCCESS:', buf.length, 'bytes');
  } catch (err) {
    console.log('Chinese FAILED:', err.message || err);
  }
}

main();
