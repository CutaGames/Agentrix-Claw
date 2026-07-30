import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';

export interface BiometricStatus {
  isAvailable: boolean;
  isEnrolled: boolean;
  biometricTypes: LocalAuthentication.AuthenticationType[];
}

class BiometricService {
  private readonly BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
  private readonly BIOMETRIC_LAST_AUTH_KEY = 'biometric_last_auth';

  /**
   * 检查设备是否支持生物识别
   */
  async checkAvailability(): Promise<BiometricStatus> {
    try {
      const isAvailable = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const biometricTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      return {
        isAvailable,
        isEnrolled,
        biometricTypes,
      };
    } catch (error) {
      console.error('Failed to check biometric availability:', error);
      return {
        isAvailable: false,
        isEnrolled: false,
        biometricTypes: [],
      };
    }
  }

  /**
   * 获取生物识别类型的友好名称
   */
  getBiometricTypeName(types: LocalAuthentication.AuthenticationType[]): string {
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return Platform.OS === 'ios' ? 'Face ID' : '面部识别';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return Platform.OS === 'ios' ? 'Touch ID' : '指纹识别';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return '虹膜识别';
    }
    return '生物识别';
  }

  /**
   * 执行生物识别认证
   */
  async authenticate(reason?: string): Promise<boolean> {
    try {
      const status = await this.checkAvailability();
      
      if (!status.isAvailable) {
        Alert.alert('不支持', '您的设备不支持生物识别');
        return false;
      }

      if (!status.isEnrolled) {
        Alert.alert(
          '未设置',
          `请先在系统设置中注册${this.getBiometricTypeName(status.biometricTypes)}`,
        );
        return false;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason || '请验证身份以继续',
        cancelLabel: '取消',
        disableDeviceFallback: false, // 允许使用密码作为备选
        fallbackLabel: '使用密码',
      });

      if (result.success) {
        // 记录最后认证时间
        await SecureStore.setItemAsync(
          this.BIOMETRIC_LAST_AUTH_KEY,
          Date.now().toString(),
        );
        return true;
      }

      if ('error' in result && ('error' in result ? result.error : 'unknown') === 'user_cancel') {
        // 用户取消，不显示错误
        return false;
      }

      if ('error' in result && ('error' in result ? result.error : 'unknown') === 'user_fallback') {
        // 用户选择使用密码
        return false;
      }

      console.log('Biometric auth failed:', ('error' in result ? result.error : 'unknown'));
      return false;
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return false;
    }
  }

  /**
   * 检查是否启用了生物识别登录
   */
  async isEnabled(): Promise<boolean> {
    try {
      const value = await SecureStore.getItemAsync(this.BIOMETRIC_ENABLED_KEY);
      return value === 'true';
    } catch (error) {
      return false;
    }
  }

  /**
   * 启用/禁用生物识别登录
   */
  async setEnabled(enabled: boolean): Promise<boolean> {
    try {
      if (enabled) {
        // 启用前先验证一次
        const authenticated = await this.authenticate('启用生物识别登录');
        if (!authenticated) {
          return false;
        }
      }

      await SecureStore.setItemAsync(
        this.BIOMETRIC_ENABLED_KEY,
        enabled ? 'true' : 'false',
      );
      return true;
    } catch (error) {
      console.error('Failed to set biometric enabled:', error);
      return false;
    }
  }

  /**
   * 获取上次认证时间
   */
  async getLastAuthTime(): Promise<number | null> {
    try {
      const value = await SecureStore.getItemAsync(this.BIOMETRIC_LAST_AUTH_KEY);
      return value ? parseInt(value, 10) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 检查是否需要重新认证（超过指定时间）
   */
  async needsReauth(maxAgeMs: number = 5 * 60 * 1000): Promise<boolean> {
    const lastAuth = await this.getLastAuthTime();
    if (!lastAuth) return true;
    return Date.now() - lastAuth > maxAgeMs;
  }

  /**
   * 用于敏感操作的快速认证
   */
  async authenticateForSensitiveAction(action: string): Promise<boolean> {
    return this.authenticate(`需要验证身份以${action}`);
  }
}

export const biometricService = new BiometricService();

/**
 * React Hook: 使用生物识别状态
 */
import { useState, useEffect } from 'react';

export function useBiometricStatus() {
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [biometricStatus, enabled] = await Promise.all([
        biometricService.checkAvailability(),
        biometricService.isEnabled(),
      ]);
      setStatus(biometricStatus);
      setIsEnabled(enabled);
      setLoading(false);
    };
    load();
  }, []);

  const toggleBiometric = async () => {
    const newValue = !isEnabled;
    const success = await biometricService.setEnabled(newValue);
    if (success) {
      setIsEnabled(newValue);
    }
    return success;
  };

  return {
    status,
    isEnabled,
    loading,
    toggleBiometric,
    biometricTypeName: status 
      ? biometricService.getBiometricTypeName(status.biometricTypes)
      : '生物识别',
  };
}
