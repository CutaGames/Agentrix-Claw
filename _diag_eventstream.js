// Direct Bedrock streaming diagnostic: test EventStream binary parsing
const axios = require('axios');
const { MessageDecoderStream, EventStreamCodec } = require('@smithy/eventstream-codec');
const { toUtf8, fromUtf8 } = require('@smithy/util-utf8');
const { Readable } = require('stream');

const TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK;
const MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const REGION = 'us-east-1';

async function* toAsyncIterable(stream) {
  for await (const chunk of stream) {
    yield chunk instanceof Uint8Array ? chunk : Buffer.from(chunk);
  }
}

async function testStreaming() {
  console.log('=== Bedrock Streaming Diagnostic ===');
  console.log('Token length:', TOKEN?.length || 0);

  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 100,
    messages: [{ role: 'user', content: 'Say hello in 5 words' }],
  };

  const start = Date.now();
  console.log(`[${Date.now() - start}ms] Sending request...`);

  const response = await axios.post(
    `https://bedrock-runtime.${REGION}.amazonaws.com/model/${MODEL}/invoke-with-response-stream`,
    body,
    {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.amazon.eventstream',
      },
      timeout: 30000,
      responseType: 'stream',
    },
  );

  console.log(`[${Date.now() - start}ms] Response status: ${response.status}`);
  console.log(`[${Date.now() - start}ms] Content-Type: ${response.headers['content-type']}`);

  const nodeStream = response.data;

  // === Method A: Raw byte inspection ===
  console.log('\n--- Raw stream bytes (first 2000 bytes) ---');
  const rawChunks = [];
  let totalBytes = 0;
  let chunkCount = 0;
  for await (const chunk of nodeStream) {
    const buf = Buffer.from(chunk);
    chunkCount++;
    totalBytes += buf.length;
    rawChunks.push(buf);
    console.log(`[${Date.now() - start}ms] Chunk #${chunkCount}: ${buf.length} bytes`);
    // Print first 200 bytes as hex + ascii for first 3 chunks
    if (chunkCount <= 3) {
      const preview = buf.slice(0, 200);
      console.log('  HEX:', preview.toString('hex').replace(/(.{2})/g, '$1 ').trim().slice(0, 120));
      console.log('  ASCII:', preview.toString('utf8').replace(/[^\x20-\x7e]/g, '.').slice(0, 120));
    }
  }
  console.log(`\n[${Date.now() - start}ms] Stream ended. Total: ${chunkCount} chunks, ${totalBytes} bytes`);

  // === Method B: Try MessageDecoderStream on the raw data ===
  console.log('\n--- MessageDecoderStream parse attempt ---');
  try {
    const combinedBuf = Buffer.concat(rawChunks);
    async function* singleChunk() { yield combinedBuf; }
    const codec = new EventStreamCodec(toUtf8, fromUtf8);
    const decoder = new MessageDecoderStream({ inputStream: singleChunk(), decoder: codec });
    let msgCount = 0;
    for await (const message of decoder) {
      msgCount++;
      const bodyStr = new TextDecoder().decode(message.body);
      console.log(`Message #${msgCount}:`);
      console.log('  Headers:', JSON.stringify(message.headers));
      console.log('  Body (first 200 chars):', bodyStr.slice(0, 200));
      // Try parsing as Bedrock event
      try {
        const outer = JSON.parse(bodyStr);
        if (outer.bytes) {
          const inner = Buffer.from(outer.bytes, 'base64').toString('utf8');
          console.log('  Decoded bytes:', inner.slice(0, 200));
        }
      } catch (e) {
        console.log('  (Not JSON or no bytes field)');
      }
    }
    console.log(`Total decoded messages: ${msgCount}`);
  } catch (e) {
    console.log('MessageDecoderStream ERROR:', e.message);
    console.log(e.stack);
  }
}

testStreaming().catch(e => {
  console.error('FATAL:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
  }
  process.exit(1);
});
