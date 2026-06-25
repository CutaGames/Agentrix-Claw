/**
 * 授权诊断工具 - 直接在浏览器控制台中使用
 * 复制以下代码到浏览器控制台执行
 */

(async function() {
  if (!window.ethereum) {
    console.error('❌ 请先连接钱包');
    return;
  }

  try {
    const { ethers } = await import('https://cdn.ethers.io/lib/ethers-6.7.0.umd.min.js');
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();

    // 获取合约地址
    let erc8004Address = '0x88b3993250Da39041C9263358C3c24C6a69a955e'; // 默认值
    let tokenAddress = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'; // BSC Testnet USDT

    try {
      const response = await fetch('/api/payments/contract-address');
      if (response.ok) {
        const data = await response.json();
        erc8004Address = data.erc8004ContractAddress || erc8004Address;
        tokenAddress = data.usdcAddress || tokenAddress;
      }
    } catch (e) {
      console.warn('无法从后端获取合约地址，使用默认值');
    }

    console.log('🔍 检查授权状态...');
    console.log(`用户钱包: ${userAddress}`);
    console.log(`ERC8004合约: ${erc8004Address}`);
    console.log(`USDT地址: ${tokenAddress}`);

    // 查询ERC8004合约使用的代币地址
    const erc8004ABI = ['function usdcToken() view returns (address)'];
    const erc8004Contract = new ethers.Contract(erc8004Address, erc8004ABI, provider);
    let erc8004TokenAddress;
    try {
      erc8004TokenAddress = await erc8004Contract.usdcToken();
      console.log(`ERC8004合约使用的代币: ${erc8004TokenAddress}`);
    } catch (error) {
      console.error('无法查询ERC8004代币地址:', error.message);
      erc8004TokenAddress = tokenAddress;
    }

    // 查询授权额度
    const tokenABI = [
      'function allowance(address owner, address spender) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ];
    const tokenContract = new ethers.Contract(erc8004TokenAddress, tokenABI, provider);
    const decimals = await tokenContract.decimals?.().then((d) => Number(d)).catch(() => 18);
    const allowance = await tokenContract.allowance(userAddress, erc8004Address);
    const allowanceFormatted = ethers.formatUnits(allowance, decimals);

    console.log('\n📊 授权状态:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`当前授权额度: ${allowanceFormatted} USDT`);
    console.log(`是否已授权: ${allowance > 0n ? '✅ 是' : '❌ 否'}`);
    
    const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const isUnlimited = allowance >= maxUint256 - BigInt(1000);
    console.log(`授权类型: ${isUnlimited ? '⚠️  无限授权' : '✅ 有限授权'}`);
    
    const tokenMatch = erc8004TokenAddress.toLowerCase() === tokenAddress.toLowerCase();
    console.log(`代币地址匹配: ${tokenMatch ? '✅' : '❌'}`);
    if (!tokenMatch) {
      console.error(`   前端使用: ${tokenAddress}`);
      console.error(`   合约使用: ${erc8004TokenAddress}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (allowance === 0n) {
      console.error('❌ 问题：未授权！');
      console.error('   解决方案：创建Session时会自动授权，或手动授权USDT给ERC8004合约');
    } else if (!tokenMatch) {
      console.error('❌ 问题：代币地址不匹配！');
      console.error('   解决方案：确保前端使用的代币地址与ERC8004合约配置的地址一致');
    } else {
      console.log('✅ 授权状态正常！');
    }

    return {
      userAddress,
      erc8004Address,
      tokenAddress,
      erc8004TokenAddress,
      allowance: allowance.toString(),
      allowanceFormatted,
      isAuthorized: allowance > 0n,
      tokenMatch,
    };
  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    console.error(error);
    throw error;
  }
})();

