
import { JsonRpcProvider } from 'ethers';

const RPC_URL = 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
const ADDRESSES = {
  'COMMISSION_0x4d10': '0x4d10DA389E0ADe7E7a7E3232531048aEaCa4021C',
  'COMMISSION_0xa0C5': '0xa0C571F348Bc1C8E08F8fcFc8805254eF128B48D',
  'ERC8004_0x3310': '0x3310a6e841877f28C755bFb5aF90e6734EF059fA',
  'ERC8004_0xFfEf': '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e'
};

async function main() {
  console.log('Connecting to RPC...');
  const provider = new JsonRpcProvider(RPC_URL);
  try {
    const network = await provider.getNetwork();
    console.log('Connected to network:', network.name, network.chainId.toString());
    
    for (const [name, addr] of Object.entries(ADDRESSES)) {
      const code = await provider.getCode(addr);
      console.log(`${name} (${addr}): ${code === '0x' ? '❌ NO CODE' : '✅ CONTRACT (' + code.length + ' bytes)'}`);
    }
  } catch (e) {
    console.error('Failed to connect to RPC:', e);
  }
}

main().catch(console.error);
