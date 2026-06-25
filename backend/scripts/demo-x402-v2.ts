import { ethers } from 'ethers';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

// Mock X402 Metadata for Discovery
const MOCK_SERVICE_URL = 'https://raw.githubusercontent.com/coinbase/x402/master/examples/weather-service/x402.json'; 
// Note: The above URL is hypothetical, we might need a real one or mock the fetch in backend.
// For now, let's use a URL that we know might fail but shows the attempt, or use a local mock if we could.

async function main() {
    console.log('🚀 Starting X402 V2 Experience Demo\n');

    // 1. Agent Autonomous Payment (Real Backend Call)
    console.log('--- 🤖 Demo: Agent Autonomous Payment ---');
    
    // Create a random wallet for the agent
    const wallet = ethers.Wallet.createRandom();
    console.log(`[Agent] 🆔 Identity created: ${wallet.address}`);
    
    const payload = {
        paymentId: 'pay_' + Date.now(),
        amount: "0.01",
        currency: "USDC",
        recipient: "0x1234567890123456789012345678901234567890",
        timestamp: Date.now(),
        scheme: 'exact',
        network: 'base'
    };
    
    // Sign payload (EIP-191)
    // In V2, we might use EIP-712, but for this demo we use simple message signing
    const message = JSON.stringify(payload);
    const signature = await wallet.signMessage(message);
    console.log(`[Agent] ✍️  Signed payment payload`);
    console.log(`        Signature: ${signature.substring(0, 30)}...`);
    
    try {
        console.log(`[Agent] 📡 Sending signature to Facilitator for verification...`);
        const response = await axios.post(`${API_URL}/x402/verify`, {
            signature,
            payload
        });
        
        if (response.data.valid) {
            console.log(`[Server] ✅ Signature Verified! Payment Authorized.`);
        } else {
            console.log(`[Server] ❌ Signature Invalid.`);
        }
    } catch (error) {
        console.log(`[Error] Failed to connect to backend: ${(error as Error).message}`);
        console.log(`(Make sure backend is running on port 3001)`);
    }

    // 2. Service Discovery (Simulation)
    console.log('\n--- 🔍 Demo: Service Discovery ---');
    console.log(`[User]  Submitting URL for discovery: https://api.weather.com`);
    console.log(`[System] ⏳ Fetching x402.json...`);
    
    // Simulate the backend logic we just wrote
    const mockMetadata = {
        name: "Premium Weather API",
        description: "Real-time weather data",
        price: "0.001",
        currency: "ETH",
        scheme: "upto",
        network: "optimism"
    };
    
    console.log(`[System] 📄 Found Metadata:`, JSON.stringify(mockMetadata, null, 2));
    console.log(`[System] ✨ Service Registered! ID: prod_${Date.now()}`);
    console.log(`[Market] 🛒 New listing appeared in Marketplace.`);

}

main().catch(console.error);
