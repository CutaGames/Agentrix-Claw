
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();

async function testGemini() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  try {
    const result = await model.generateContent('Say hello');
    console.log('✅ Gemini Success:', result.response.text());
  } catch (e) {
    console.error('❌ Gemini Failed:', e.message);
  }
}

testGemini();
