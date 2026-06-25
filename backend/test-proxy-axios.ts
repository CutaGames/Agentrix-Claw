
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

async function test() {
  const proxy = 'http://172.22.240.1:9098';
  console.log(`Testing Axios with HttpsProxyAgent: ${proxy}`);
  
  const httpsAgent = new HttpsProxyAgent(proxy);

  try {
    const res = await axios.get('https://www.google.com', { 
      httpsAgent,
      proxy: false,
      timeout: 5000
    });
    console.log(`Success! Status: ${res.status}`);
  } catch (e: any) {
    console.error(`Failed! Error: ${e.message}`);
  }
}

test();
