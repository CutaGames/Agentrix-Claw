import axios from 'axios';

async function testTransakSession() {
  const API_URL = 'https://api.agentrix.top/api';
  console.log(`🚀 开始测试 Transak Session 创建: ${API_URL}`);

  try {
    const response = await axios.post(`${API_URL}/payments/provider/transak/create-session`, {
      amount: 100,
      fiatCurrency: 'USD',
      cryptoCurrency: 'BNB',
      network: 'bsc',
      email: 'test@agentrix.top',
      redirectURL: 'https://agentrix.top/payment/success'
    }, {
      timeout: 15000
    });

    console.log('✅ 成功获取 Transak Session:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ 测试失败:');
    if (error.response) {
      console.error(`状态码: ${error.response.status}`);
      console.error('错误详情:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

testTransakSession();
