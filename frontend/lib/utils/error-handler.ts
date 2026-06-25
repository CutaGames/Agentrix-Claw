/**
 * 统一错误处理工具
 */

export interface PaymentError {
  code: string
  message: string
  retryable: boolean
  retryAfter?: number // 重试等待时间（秒）
}

export class PaymentErrorHandler {
  /**
   * 处理Provider API错误
   */
  static handleProviderError(error: any): PaymentError {
    if (error.response) {
      const status = error.response.status
      
      if (status === 429) {
        // 请求过于频繁
        const retryAfter = error.response.headers['retry-after'] || 60
        return {
          code: 'RATE_LIMIT',
          message: '请求过于频繁，请稍后再试',
          retryable: true,
          retryAfter: parseInt(retryAfter),
        }
      }
      
      if (status >= 500) {
        // 服务器错误
        return {
          code: 'SERVER_ERROR',
          message: '服务暂时不可用，请稍后重试',
          retryable: true,
          retryAfter: 30,
        }
      }
      
      if (status === 400) {
        return {
          code: 'BAD_REQUEST',
          message: error.response.data?.message || '请求参数错误',
          retryable: false,
        }
      }
    }
    
    if (error.code === 'NETWORK_ERROR' || error.message?.includes('network')) {
      return {
        code: 'NETWORK_ERROR',
        message: '网络连接失败，请检查网络后重试',
        retryable: true,
        retryAfter: 10,
      }
    }
    
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || '发生未知错误，请重试',
      retryable: true,
      retryAfter: 30,
    }
  }

  /**
   * 处理汇率锁定过期错误
   */
  static handleQuoteExpiredError(): PaymentError {
    return {
      code: 'QUOTE_EXPIRED',
      message: '汇率锁定已过期，请重新获取报价',
      retryable: true,
      retryAfter: 0, // 立即重试
    }
  }

  /**
   * 处理支付失败错误
   */
  static handlePaymentError(error: any): PaymentError {
    if (error.response?.data?.code === 'INSUFFICIENT_FUNDS') {
      return {
        code: 'INSUFFICIENT_FUNDS',
        message: '余额不足，请充值后重试',
        retryable: false,
      }
    }
    
    if (error.response?.data?.code === 'PAYMENT_FAILED') {
      return {
        code: 'PAYMENT_FAILED',
        message: '支付失败，请检查支付信息后重试',
        retryable: true,
        retryAfter: 5,
      }
    }
    
    return this.handleProviderError(error)
  }

  /**
   * 重试函数
   */
  static async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
  ): Promise<T> {
    let lastError: any
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error
        const errorInfo = this.handleProviderError(error)
        
        if (!errorInfo.retryable || i === maxRetries - 1) {
          throw error
        }
        
        const waitTime = errorInfo.retryAfter ? errorInfo.retryAfter * 1000 : delay * (i + 1)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
    
    throw lastError
  }
}

