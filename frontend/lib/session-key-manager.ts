import { ethers } from 'ethers';

export interface SessionKeyPair {
  publicKey: string; // Session Key 地址
  privateKey: string; // 加密后的私钥
}

export class SessionKeyManager {
  private static readonly STORAGE_KEY = 'agentrix_session_keys';
  private static readonly STORAGE_VERSION = 'v1';

  /**
   * 生成 Session Key（浏览器本地）
   */
  static async generateSessionKey(): Promise<SessionKeyPair> {
    try {
      // 生成随机钱包
      const wallet = ethers.Wallet.createRandom();
      const publicKey = wallet.address;
      const privateKey = wallet.privateKey;

      // 加密私钥（使用用户密码或主钱包签名）
      const encryptedPrivateKey = await this.encryptPrivateKey(privateKey);

      // 保存到 IndexedDB/LocalStorage
      await this.saveToStorage(publicKey, encryptedPrivateKey);

      return {
        publicKey,
        privateKey: encryptedPrivateKey,
      };
    } catch (error) {
      console.error('Failed to generate session key:', error);
      throw new Error('Failed to generate session key');
    }
  }

  /**
   * 使用 Session Key 签名
   */
  static async signWithSessionKey(
    sessionKeyAddress: string,
    message: string | Uint8Array,
  ): Promise<string> {
    try {
      // 从存储获取加密私钥
      const encryptedPrivateKey = await this.getFromStorage(sessionKeyAddress);
      if (!encryptedPrivateKey) {
        throw new Error('Session key not found');
      }

      // 解密私钥
      const privateKey = await this.decryptPrivateKey(encryptedPrivateKey);

      // 使用私钥签名
      // 注意：如果message已经是hash，需要使用signHash而不是signMessage
      // signMessage会自动添加EIP-191前缀并再次哈希，signHash直接签名hash
      const wallet = new ethers.Wallet(privateKey);
      const messageBytes = typeof message === 'string'
        ? ethers.getBytes(message)
        : message;
      
      // 检查是否是32字节的hash（0x + 64 hex chars）
      const isHash = messageBytes.length === 32;
      
      if (isHash) {
        // 如果已经是hash，需要手动添加EIP-191前缀（与合约验证逻辑一致）
        // 合约使用：keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", innerHash))
        // 我们需要使用 solidityPackedKeccak256 来匹配 abi.encodePacked
        const messageHashWithPrefix = ethers.solidityPackedKeccak256(
          ['string', 'bytes32'],
          ['\x19Ethereum Signed Message:\n32', messageBytes],
        );
        // 使用signingKey.sign签名hash（不添加前缀，因为我们已经手动添加了）
        const sig = wallet.signingKey.sign(messageHashWithPrefix);
        // 序列化为标准签名格式
        return ethers.Signature.from(sig).serialized;
      } else {
        // 如果是原始消息，使用signMessage（会自动添加EIP-191前缀）
        const signature = await wallet.signMessage(messageBytes);
        return signature;
      }
    } catch (error) {
      console.error('Failed to sign with session key:', error);
      throw new Error('Failed to sign with session key');
    }
  }

  /**
   * 加密私钥（使用 Web Crypto API）
   */
  private static async encryptPrivateKey(privateKey: string): Promise<string> {
    try {
      // 使用 Web Crypto API 加密
      // 实际实现应该使用用户密码或主钱包签名作为密钥
      // 这里简化实现，使用 Base64 编码（生产环境应使用 AES-GCM）
      
      // 生成加密密钥（从用户密码派生）
      const password = await this.getUserPassword();
      const encodedPassword = new TextEncoder().encode(password);
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encodedPassword.buffer as ArrayBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey'],
      );

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        new Uint8Array(new TextEncoder().encode(privateKey)),
      );

      // 组合 salt + iv + encrypted data
      const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);

      // Base64 编码
      return btoa(String.fromCharCode.apply(null, Array.from(combined)));
    } catch (error) {
      console.error('Encryption failed, using fallback:', error);
      // 降级到 Base64 编码（仅用于开发环境）
      return btoa(privateKey);
    }
  }

  /**
   * 解密私钥
   */
  private static async decryptPrivateKey(encryptedPrivateKey: string): Promise<string> {
    try {
      // Base64 解码
      const combined = new Uint8Array(
        atob(encryptedPrivateKey)
          .split('')
          .map((c) => c.charCodeAt(0)),
      );

      const salt = combined.slice(0, 16);
      const iv = combined.slice(16, 28);
      const encrypted = combined.slice(28);

      // 生成解密密钥
      const password = await this.getUserPassword();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(new TextEncoder().encode(password)),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey'],
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );

      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        encrypted,
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Decryption failed, using fallback:', error);
      // 降级到 Base64 解码（仅用于开发环境）
      return atob(encryptedPrivateKey);
    }
  }

  /**
   * 获取用户密码（简化实现，实际应从安全存储获取）
   */
  private static async getUserPassword(): Promise<string> {
    // 实际实现应该从安全存储获取用户密码
    // 或使用主钱包签名作为密钥
    const stored = localStorage.getItem('agentrix_user_password_hash');
    if (stored) {
      return stored;
    }
    // 生成临时密码（仅用于开发）
    const tempPassword = `agentrix_${Date.now()}`;
    localStorage.setItem('agentrix_user_password_hash', tempPassword);
    return tempPassword;
  }

  /**
   * 保存到存储（IndexedDB 或 LocalStorage）
   */
  private static async saveToStorage(
    publicKey: string,
    encryptedPrivateKey: string,
  ): Promise<void> {
    try {
      // 尝试使用 IndexedDB
      if ('indexedDB' in window) {
        // IndexedDB 实现（需要 idb 库）
        // 这里简化使用 LocalStorage
        localStorage.setItem(
          `${this.STORAGE_KEY}_${this.STORAGE_VERSION}_${publicKey}`,
          encryptedPrivateKey,
        );
      } else {
        // 降级到 LocalStorage
        localStorage.setItem(
          `${this.STORAGE_KEY}_${this.STORAGE_VERSION}_${publicKey}`,
          encryptedPrivateKey,
        );
      }
    } catch (error) {
      console.error('Failed to save to storage:', error);
      throw error;
    }
  }

  /**
   * 从存储获取
   */
  private static async getFromStorage(publicKey: string): Promise<string | null> {
    try {
      return localStorage.getItem(
        `${this.STORAGE_KEY}_${this.STORAGE_VERSION}_${publicKey}`,
      );
    } catch (error) {
      console.error('Failed to get from storage:', error);
      return null;
    }
  }

  /**
   * 删除 Session Key
   */
  static async deleteSessionKey(publicKey: string): Promise<void> {
    try {
      localStorage.removeItem(
        `${this.STORAGE_KEY}_${this.STORAGE_VERSION}_${publicKey}`,
      );
    } catch (error) {
      console.error('Failed to delete session key:', error);
    }
  }

  /**
   * 列出所有 Session Key
   */
  static async listSessionKeys(): Promise<string[]> {
    try {
      const keys: string[] = [];
      const prefix = `${this.STORAGE_KEY}_${this.STORAGE_VERSION}_`;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const publicKey = key.replace(prefix, '');
          keys.push(publicKey);
        }
      }
      
      return keys;
    } catch (error) {
      console.error('Failed to list session keys:', error);
      return [];
    }
  }
}

