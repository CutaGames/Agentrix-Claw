import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, KYCLevel } from '../../entities/user.entity';
import { AuthService } from '../../modules/auth/auth.service';
import * as request from 'supertest';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  authToken: string;
  user: User;
}

export interface TestMerchant {
  id: string;
  email: string;
  authToken: string;
  user: User;
}

/**
 * 创建测试用户
 */
export async function createTestUser(
  app: INestApplication,
  email: string = `test-${Date.now()}@test.com`,
  password: string = 'Test123456!',
  roles: UserRole[] = [UserRole.USER],
  kycLevel: KYCLevel = KYCLevel.NONE,
  kycStatus: string = 'none',
): Promise<TestUser> {
  const authService = app.get(AuthService);
  const userRepository = app.get<Repository<User>>(getRepositoryToken(User));

  // 检查用户是否已存在
  let existingUser = await userRepository.findOne({ where: { email } });
  if (existingUser) {
    // 如果用户已存在，删除后重新创建
    await userRepository.remove(existingUser);
  }

  // 注册新用户
  let registerResult;
  try {
    registerResult = await authService.register({
      email,
      password,
      agentrixId: `AX-test-${Date.now()}`,
    });
  } catch (error: any) {
    // 如果用户已存在，尝试登录
    if (error.message?.includes('已注册') || error.status === 409) {
      const loginUser = await authService.validateUser(email, password);
      if (loginUser) {
        registerResult = await authService.login(loginUser);
        const existingUser = await userRepository.findOne({ where: { email } });
        if (existingUser) {
          existingUser.roles = roles;
          existingUser.kycLevel = kycLevel;
          existingUser.kycStatus = kycStatus;
          await userRepository.save(existingUser);
          return {
            id: existingUser.id,
            email,
            password,
            authToken: registerResult.access_token,
            user: existingUser,
          };
        }
      }
    }
    throw error;
  }

  // 更新用户角色和KYC状态
  const user = await userRepository.findOne({ where: { id: registerResult.user.id } });
  if (user) {
    user.roles = roles;
    user.kycLevel = kycLevel;
    user.kycStatus = kycStatus;
    await userRepository.save(user);
  }

  return {
    id: registerResult.user.id,
    email,
    password,
    authToken: registerResult.access_token,
    user: user!,
  };
}

/**
 * 创建测试商家
 */
export async function createTestMerchant(
  app: INestApplication,
  email: string = `merchant-${Date.now()}@test.com`,
): Promise<TestMerchant> {
  const testUser = await createTestUser(app, email, 'Test123456!', [UserRole.MERCHANT]);
  return {
    id: testUser.id,
    email: testUser.email,
    authToken: testUser.authToken,
    user: testUser.user,
  };
}

/**
 * 清理测试数据
 */
export async function cleanupTestData(app: INestApplication | null, userIds: string[]) {
  if (!app) {
    console.warn('App is null, skipping cleanup');
    return;
  }

  try {
    const userRepository = app.get<Repository<User>>(getRepositoryToken(User));
    for (const userId of userIds) {
      try {
        const user = await userRepository.findOne({ where: { id: userId } });
        if (user) {
          await userRepository.remove(user);
        }
      } catch (error) {
        // 忽略删除错误
        console.warn(`Failed to cleanup user ${userId}:`, error);
      }
    }
  } catch (error) {
    // 如果 app 已经关闭，忽略错误
    console.warn('Failed to cleanup test data:', error);
  }
}

/**
 * 获取认证的请求
 * 返回一个可以链式调用的请求对象
 */
export function authenticatedRequest(
  app: INestApplication,
  authToken: string,
): any {
  const agent = request(app.getHttpServer());
  
  // 创建一个包装对象，拦截所有HTTP方法调用
  const wrapper: any = {};
  
  // 包装所有HTTP方法
  ['get', 'post', 'put', 'delete', 'patch'].forEach(method => {
    wrapper[method] = function(url: string) {
      return (agent as any)[method](url).set('Authorization', `Bearer ${authToken}`);
    };
  });
  
  return wrapper;
}

