import { NextApiRequest, NextApiResponse } from 'next';

/**
 * 简单的 API 认证中间件包装器
 * 用于验证用户会话并从请求中提取 userId 和 token
 */
export function withAuth(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<any>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // 1. 从 Authorization header 提取 token
      let token: string | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }

      // 2. 尝试从 Header 获取 userId（供开发测试）
      let userId = req.headers['x-user-id'] as string;

      // 3. 如果没有，则尝试从 Cookie 中提取（模拟生产环境）
      if (!userId && req.headers.cookie) {
        // 这里应该是解析 session cookie 的逻辑
        const match = req.headers.cookie.match(/userId=([^;]+)/);
        if (match) userId = match[1];
      }

      // 4. 如果有 token，可以从 token 中提取 userId（实际应用需要验证 JWT）
      if (!userId && token) {
        try {
          // 简单解析 JWT payload（不验证签名，仅用于提取 userId）
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          userId = payload.sub || payload.userId || payload.id;
        } catch (e) {
          // Token 解析失败，继续
        }
      }

      // 5. 开发环境默认 ID
      if (!userId && process.env.NODE_ENV === 'development') {
        userId = 'dev-user-123';
      }

      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized: No user session found' });
      }

      // 将 userId 和 token 注入请求对象
      (req as any).userId = userId;
      (req as any).token = token;

      return await handler(req, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ message: 'Internal server error in auth middleware' });
    }
  };
}
