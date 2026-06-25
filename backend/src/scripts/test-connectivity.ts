import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testConnectivity() {
  console.log('--- Agentrix Connectivity Diagnostic ---');
  console.log('Current Time:', new Date().toISOString());
  console.log('Node Version:', process.version);
  
  // 1. Check basic internet
  console.log('\n[1/3] Checking basic internet (google.com)...');
  try {
    const res = await axios.get('https://www.google.com', { timeout: 5000 });
    console.log('✅ Success: Google is reachable (Status:', res.status, ')');
  } catch (e: any) {
    console.error('❌ Failed: Cannot reach google.com.', e.message);
  }

  // 2. Check Gemini API Endpoint
  console.log('\n[2/3] Checking Gemini API Endpoint...');
  try {
    const res = await axios.get('https://generativelanguage.googleapis.com/', { timeout: 5000 });
    console.log('✅ Success: Gemini API endpoint is reachable.');
  } catch (e: any) {
    console.error('❌ Failed: Cannot reach Gemini API endpoint.', e.message);
    console.log('Tip: If you are in a restricted region, you MUST configure a proxy in WSL.');
  }

  // 3. Test API Key with Client
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('\n[3/3] ❌ Failed: GEMINI_API_KEY is not set in .env');
    return;
  }

  console.log('\n[3/3] Testing Gemini API Key...');
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hello, are you there?");
    const response = await result.response;
    console.log('✅ Success: API Key is valid. Response:', response.text());
  } catch (e: any) {
    console.error('❌ Failed: Gemini API call failed.', e.message);
    if (e.message.includes('fetch failed')) {
      console.log('\n--- HOW TO FIX "FETCH FAILED" ---');
      console.log('This is usually a proxy issue in WSL. Try running these commands in your WSL terminal:');
      console.log('1. Find your Windows Host IP: tail -n 1 /etc/resolv.conf | awk \'{print $2}\'');
      console.log('2. Export proxy (replace IP and 7890 with your proxy port):');
      console.log('   export https_proxy="http://YOUR_WINDOWS_IP:7890"');
      console.log('   export http_proxy="http://YOUR_WINDOWS_IP:7890"');
      console.log('3. Restart the backend: ./start-all.sh');
    }
  }
}

testConnectivity();
