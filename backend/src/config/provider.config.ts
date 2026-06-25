import { registerAs } from '@nestjs/config';

export default registerAs('provider', () => ({
  moonpay: {
    apiKey: process.env.MOONPAY_API_KEY || '',
    apiUrl: process.env.MOONPAY_API_URL || 'https://api.moonpay.com',
  },
  meld: {
    apiKey: process.env.MELD_API_KEY || '',
    apiUrl: process.env.MELD_API_URL || 'https://api.meld.com',
  },
  paymindContractAddress: process.env.PAYMIND_CONTRACT_ADDRESS || '',
}));

