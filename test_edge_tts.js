const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');

async function testPolly() {
  console.log('Testing AWS Polly TTS (Chinese)...');
  const client = new PollyClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    const result = await client.send(new SynthesizeSpeechCommand({
      Text: '你好，我是Agentrix语音助手',
      OutputFormat: 'mp3',
      VoiceId: 'Zhiyu',
      Engine: 'neural',
      LanguageCode: 'cmn-CN',
    }));
    
    const chunks = [];
    for await (const chunk of result.AudioStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    console.log(`SUCCESS! Polly returned ${buf.length} bytes of MP3 audio`);
    require('fs').writeFileSync('/tmp/polly_test.mp3', buf);
    console.log('Saved to /tmp/polly_test.mp3');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

testPolly().catch(console.error);
