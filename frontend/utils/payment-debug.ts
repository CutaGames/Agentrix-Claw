/**
 * 统一支付调试工具
 * 用于在浏览器控制台快速诊断支付问题
 */

export class PaymentDebug {
  /**
   * 检查 API 配置
   */
  static checkApiConfig() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    console.log('📋 API 配置检查:');
    console.log('  - API URL:', apiUrl);
    console.log('  - 环境变量 NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL || '未设置（使用默认值）');
    return apiUrl;
  }

  /**
   * 检查认证状态
   */
  static checkAuth() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    console.log('🔐 认证状态检查:');
    console.log('  - Token 存在:', !!token);
    if (token) {
      try {
        // 简单的 JWT 解析（不验证签名）
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('  - Token 过期时间:', new Date(payload.exp * 1000).toLocaleString());
        console.log('  - Token 用户 ID:', payload.sub || payload.userId);
        console.log('  - Token 是否过期:', Date.now() > payload.exp * 1000);
      } catch (e) {
        console.warn('  - Token 格式可能不正确');
      }
    }
    return token;
  }

  /**
   * 测试后端连接
   */
  static async testBackendConnection() {
    const apiUrl = this.checkApiConfig();
    const baseUrl = apiUrl.replace('/api', '');
    
    console.log('🌐 测试后端连接:');
    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('  ✅ 后端连接正常:', data);
        return true;
      } else {
        console.error('  ❌ 后端响应异常:', response.status, response.statusText);
        return false;
      }
    } catch (error: any) {
      console.error('  ❌ 后端连接失败:', error.message);
      console.error('  💡 请确认后端服务已启动在', baseUrl);
      return false;
    }
  }

  /**
   * 测试支付路由 API
   */
  static async testPaymentRouting(amount: number = 100, currency: string = 'CNY') {
    const apiUrl = this.checkApiConfig();
    const token = this.checkAuth();
    
    console.log('💳 测试支付路由 API:');
    
    if (!token) {
      console.error('  ❌ 未找到认证 Token，请先登录');
      return null;
    }

    try {
      const params = new URLSearchParams({
        amount: amount.toString(),
        currency,
      });
      
      const response = await fetch(`${apiUrl}/payments/routing?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('  ✅ 支付路由 API 正常:', data);
        return data;
      } else {
        const errorText = await response.text();
        console.error('  ❌ 支付路由 API 失败:', response.status, response.statusText);
        console.error('  📄 错误详情:', errorText);
        return null;
      }
    } catch (error: any) {
      console.error('  ❌ 支付路由 API 请求失败:', error.message);
      return null;
    }
  }

  /**
   * 测试创建支付意图
   */
  static async testCreateIntent(amount: number = 100, currency: string = 'CNY') {
    const apiUrl = this.checkApiConfig();
    const token = this.checkAuth();
    
    console.log('💳 测试创建支付意图:');
    
    if (!token) {
      console.error('  ❌ 未找到认证 Token，请先登录');
      return null;
    }

    try {
      const response = await fetch(`${apiUrl}/payments/create-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          currency,
          paymentMethod: 'stripe',
          description: '测试支付',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('  ✅ 创建支付意图成功:', data);
        return data;
      } else {
        const errorText = await response.text();
        console.error('  ❌ 创建支付意图失败:', response.status, response.statusText);
        console.error('  📄 错误详情:', errorText);
        return null;
      }
    } catch (error: any) {
      console.error('  ❌ 创建支付意图请求失败:', error.message);
      return null;
    }
  }

  /**
   * 完整诊断
   */
  static async fullDiagnosis() {
    console.log('🔍 开始完整支付系统诊断...\n');
    
    // 1. API 配置
    this.checkApiConfig();
    console.log('');
    
    // 2. 认证状态
    this.checkAuth();
    console.log('');
    
    // 3. 后端连接
    const backendOk = await this.testBackendConnection();
    console.log('');
    
    if (!backendOk) {
      console.error('⚠️  后端服务未启动或无法连接，请先启动后端服务');
      return;
    }
    
    // 4. 支付路由
    await this.testPaymentRouting();
    console.log('');
    
    // 5. 创建支付意图
    await this.testCreateIntent();
    console.log('');
    
    console.log('✅ 诊断完成');
  }

  /**
   * 检查 PaymentContext 状态
   */
  static checkPaymentContext() {
    console.log('💳 PaymentContext 状态检查:');
    
    if (typeof window === 'undefined') {
      console.warn('  ⚠️  此检查需要在浏览器环境中运行');
      return;
    }

    // 检查是否有支付相关的全局状态
    const paymentData = sessionStorage.getItem('payment_data');
    console.log('  - SessionStorage 支付数据:', paymentData ? '存在' : '不存在');
    
    // 检查 localStorage
    const token = localStorage.getItem('access_token');
    console.log('  - Access Token:', token ? '存在' : '不存在');
    
    return {
      hasPaymentData: !!paymentData,
      hasToken: !!token,
    };
  }
}

// 在浏览器环境中，将工具挂载到 window 对象
if (typeof window !== 'undefined') {
  (window as any).PaymentDebug = PaymentDebug;
  console.log('💡 支付调试工具已加载，使用 PaymentDebug.fullDiagnosis() 进行完整诊断');
}
