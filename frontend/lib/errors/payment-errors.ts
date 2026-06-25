/**
 * 支付相关错误定义
 */

export class PaymentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export class SessionError extends PaymentError {
  constructor(message: string, code: string, statusCode?: number) {
    super(message, code, statusCode);
    this.name = 'SessionError';
  }
}

export class QuickPayError extends PaymentError {
  constructor(message: string, code: string, statusCode?: number) {
    super(message, code, statusCode);
    this.name = 'QuickPayError';
  }
}

export class RelayerError extends PaymentError {
  constructor(message: string, code: string, statusCode?: number) {
    super(message, code, statusCode);
    this.name = 'RelayerError';
  }
}

// 错误代码定义
export const ERROR_CODES = {
  // Session 错误
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_LIMIT_EXCEEDED: 'SESSION_LIMIT_EXCEEDED',
  SESSION_INVALID_SIGNATURE: 'SESSION_INVALID_SIGNATURE',
  
  // QuickPay 错误
  QUICKPAY_NO_SESSION: 'QUICKPAY_NO_SESSION',
  QUICKPAY_INSUFFICIENT_BALANCE: 'QUICKPAY_INSUFFICIENT_BALANCE',
  QUICKPAY_INVALID_SIGNATURE: 'QUICKPAY_INVALID_SIGNATURE',
  QUICKPAY_REPLAY_ATTACK: 'QUICKPAY_REPLAY_ATTACK',
  
  // Relayer 错误
  RELAYER_UNAVAILABLE: 'RELAYER_UNAVAILABLE',
  RELAYER_QUEUE_FULL: 'RELAYER_QUEUE_FULL',
  RELAYER_ON_CHAIN_FAILED: 'RELAYER_ON_CHAIN_FAILED',
  
  // 通用错误
  WALLET_NOT_CONNECTED: 'WALLET_NOT_CONNECTED',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

// 错误消息映射
export const ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.SESSION_NOT_FOUND]: 'Session not found',
  [ERROR_CODES.SESSION_EXPIRED]: 'Session has expired',
  [ERROR_CODES.SESSION_REVOKED]: 'Session has been revoked',
  [ERROR_CODES.SESSION_LIMIT_EXCEEDED]: 'Transaction amount exceeds session limit',
  [ERROR_CODES.SESSION_INVALID_SIGNATURE]: 'Invalid session signature',
  
  [ERROR_CODES.QUICKPAY_NO_SESSION]: 'No active session found. Please create a session first.',
  [ERROR_CODES.QUICKPAY_INSUFFICIENT_BALANCE]: 'Insufficient wallet balance',
  [ERROR_CODES.QUICKPAY_INVALID_SIGNATURE]: 'Invalid signature',
  [ERROR_CODES.QUICKPAY_REPLAY_ATTACK]: 'Invalid nonce (possible replay attack)',
  
  [ERROR_CODES.RELAYER_UNAVAILABLE]: 'Relayer service is currently unavailable',
  [ERROR_CODES.RELAYER_QUEUE_FULL]: 'Relayer queue is full. Please try again later.',
  [ERROR_CODES.RELAYER_ON_CHAIN_FAILED]: 'On-chain execution failed',
  
  [ERROR_CODES.WALLET_NOT_CONNECTED]: 'Please connect your wallet first',
  [ERROR_CODES.INVALID_ADDRESS]: 'Invalid Ethereum address',
  [ERROR_CODES.NETWORK_ERROR]: 'Network error. Please check your connection.',
  [ERROR_CODES.UNKNOWN_ERROR]: 'An unknown error occurred',
};

/**
 * 创建错误对象
 */
export function createPaymentError(
  code: string,
  message?: string,
  statusCode?: number,
): PaymentError {
  const errorMessage = message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR];
  
  if (code.startsWith('SESSION_')) {
    return new SessionError(errorMessage, code, statusCode);
  }
  if (code.startsWith('QUICKPAY_')) {
    return new QuickPayError(errorMessage, code, statusCode);
  }
  if (code.startsWith('RELAYER_')) {
    return new RelayerError(errorMessage, code, statusCode);
  }
  
  return new PaymentError(errorMessage, code, statusCode);
}

/**
 * 处理 API 错误响应
 */
export function handleApiError(error: any): PaymentError {
  if (error instanceof PaymentError) {
    return error;
  }
  
  // 处理 HTTP 错误
  if (error.response) {
    const statusCode = error.response.status;
    const code = error.response.data?.code || ERROR_CODES.UNKNOWN_ERROR;
    const message = error.response.data?.message || error.message;
    return createPaymentError(code, message, statusCode);
  }
  
  // 处理网络错误
  if (error.request) {
    return createPaymentError(ERROR_CODES.NETWORK_ERROR);
  }
  
  // 处理其他错误
  return createPaymentError(ERROR_CODES.UNKNOWN_ERROR, error.message);
}

