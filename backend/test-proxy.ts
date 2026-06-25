
import { ProxyAgent, setGlobalDispatcher } from 'undici';

async function test() {
  const httpsProxy = 'http://172.22.240.1:9098';
  console.log(`Testing with proxy: ${httpsProxy}`);
  
  const proxyAgent = new ProxyAgent(httpsProxy);
  setGlobalDispatcher(proxyAgent);

  try {
    // @ts-ignore
    const res = await fetch('https://www.google.com'); 
    console.log(`Success! Status: ${res.status}`);
  } catch (e: any) {
    console.error(`Failed! Error: ${e.message}`);
  }
}

test();
