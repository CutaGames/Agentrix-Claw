require('dotenv').config();
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const fs = require('fs');

async function test() {
  const polly = new PollyClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // Test neural Zhiyu
  const cmd1 = new SynthesizeSpeechCommand({
    Engine: 'neural',
    VoiceId: 'Zhiyu',
    LanguageCode: 'cmn-CN',
    OutputFormat: 'mp3',
    Text: '你好，我是你的智能助手，很高兴认识你。今天天气不错，我们可以聊聊你感兴趣的话题。',
  });
  const resp1 = await polly.send(cmd1);
  const chunks1 = [];
  for await (const chunk of resp1.AudioStream) chunks1.push(chunk);
  const buf1 = Buffer.concat(chunks1);
  fs.writeFileSync('/tmp/test_zh_neural.mp3', buf1);
  console.log('Neural Zhiyu:', buf1.length, 'bytes, chars:', resp1.RequestCharacters);

  // Test standard Zhiyu for comparison
  const cmd2 = new SynthesizeSpeechCommand({
    Engine: 'standard',
    VoiceId: 'Zhiyu',
    LanguageCode: 'cmn-CN',
    OutputFormat: 'mp3',
    Text: '你好，我是你的智能助手，很高兴认识你。今天天气不错，我们可以聊聊你感兴趣的话题。',
  });
  const resp2 = await polly.send(cmd2);
  const chunks2 = [];
  for await (const chunk of resp2.AudioStream) chunks2.push(chunk);
  const buf2 = Buffer.concat(chunks2);
  fs.writeFileSync('/tmp/test_zh_standard.mp3', buf2);
  console.log('Standard Zhiyu:', buf2.length, 'bytes, chars:', resp2.RequestCharacters);

  // Test neural English Matthew
  const cmd3 = new SynthesizeSpeechCommand({
    Engine: 'neural',
    VoiceId: 'Matthew',
    LanguageCode: 'en-US',
    OutputFormat: 'mp3',
    Text: 'Hello, I am your AI assistant. Nice to meet you! The weather is great today.',
  });
  const resp3 = await polly.send(cmd3);
  const chunks3 = [];
  for await (const chunk of resp3.AudioStream) chunks3.push(chunk);
  const buf3 = Buffer.concat(chunks3);
  console.log('Neural Matthew:', buf3.length, 'bytes, chars:', resp3.RequestCharacters);
}

test().catch(e => console.error('ERROR:', e.message));
