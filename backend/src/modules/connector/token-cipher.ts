import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * TokenCipher — OAuth 令牌的对称加密器(AES-256-GCM)。
 *
 * 密钥来自环境变量 `CONNECTOR_TOKEN_KEY`,经 scrypt 派生为 32 字节密钥。
 * 密钥缺失时构造即抛错(启动报错,R6.2/R6.8),避免令牌以可逆性不足的默认密钥落库。
 *
 * 密文格式:`iv(hex):enc(hex):authTag(hex)`,与既有 ai-provider 加密约定一致。
 * 加解密往返保真;authTag 校验防篡改;任何明文令牌都不写日志。
 */
@Injectable()
export class TokenCipher {
  private readonly logger = new Logger(TokenCipher.name);
  private readonly key: Buffer;

  constructor() {
    const secret = process.env.CONNECTOR_TOKEN_KEY;
    if (!secret || secret.trim().length === 0) {
      // 缺失即启动报错(R6.2):OAuth 令牌必须可靠加密,不允许回退到默认密钥。
      throw new Error(
        'CONNECTOR_TOKEN_KEY environment variable is required to encrypt OAuth connector tokens but is missing.',
      );
    }
    // scrypt 派生固定长度密钥;允许任意长度 secret(建议 ≥32 字节熵)。
    this.key = scryptSync(secret, 'agentrix-connector-token-salt', 32);
  }

  /** 加密明文令牌 → `iv:enc:tag`(hex)。 */
  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), encrypted.toString('hex'), tag.toString('hex')].join(':');
  }

  /** 解密 `iv:enc:tag`(hex)→ 明文令牌;格式非法或校验失败抛错。 */
  decrypt(ciphertext: string): string {
    const [ivHex, encHex, tagHex] = (ciphertext || '').split(':');
    if (!ivHex || !encHex || !tagHex) {
      throw new Error('Invalid encrypted token format');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return (
      decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8')
    );
  }
}
