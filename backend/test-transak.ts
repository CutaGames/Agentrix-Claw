import axios from 'axios';

async function testTransak() {
  const apiKey = '7f03deb8-ee24-49b3-a919-31e7d9244030';
  const baseUrl = 'https://api.transak.com';
  
  const testCases = [
    { fiatCurrency: 'USD', cryptoCurrency: 'ETH', fiatAmount: 100, network: 'ethereum' },
    { fiatCurrency: 'USD', cryptoCurrency: 'USDT', fiatAmount: 100, network: 'bsc' },
    { fiatCurrency: 'USD', cryptoCurrency: 'ETH', fiatAmount: 100, isSourceAmount: true },
  ];

  for (const params of testCases) {
    console.log(`Testing with params: ${JSON.stringify(params)}`);
    try {
      const response = await axios.get(`${baseUrl}/api/v2/currencies/price`, {
        params: {
          ...params,
          partnerAPIKey: apiKey,
        },
        headers: {
          'apiKey': apiKey,
        }
      });
      console.log(`Success! Response:`, JSON.stringify(response.data.response || response.data).substring(0, 200));
    } catch (error: any) {
      console.log(`Failed: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`);
    }
    console.log('---');
  }
}

testTransak();
