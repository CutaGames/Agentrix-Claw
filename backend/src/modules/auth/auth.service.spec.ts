import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';

// Mock native modules before importing AuthService
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockImplementation((password: string) => Promise.resolve(`hashed_${password}`)),
  compare: jest.fn().mockImplementation((plain: string, hash: string) =>
    Promise.resolve(hash === `hashed_${plain}`),
  ),
}));

jest.mock('ethers', () => ({
  verifyMessage: jest.fn().mockReturnValue('0x0000000000000000000000000000000000000000'),
  isAddress: jest.fn().mockReturnValue(true),
}));

import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { User, UserRole } from '../../entities/user.entity';
import { WalletConnection, ChainType } from '../../entities/wallet-connection.entity';
import { AccountService } from '../account/account.service';
import { UserAgent } from '../../entities/user-agent.entity';
import { DesktopPairSession } from '../../entities/desktop-pair-session.entity';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((dto) => ({ id: 'mock-user-id', ...dto })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'mock-user-id', ...entity })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    remove: jest.fn().mockResolvedValue(undefined),
    manager: {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue({}),
      }),
    },
  };
}

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn().mockReturnValue({ sub: 'mock-user-id' }),
};

const mockAccountService = {
  findByOwner: jest.fn().mockResolvedValue([]),
  createUserDefaultAccount: jest.fn().mockResolvedValue({}),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    const config: Record<string, string> = {
      APPLE_CLIENT_ID: 'com.agentrix.app',
    };
    return config[key] || undefined;
  }),
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: ReturnType<typeof mockRepo>;
  let walletRepo: ReturnType<typeof mockRepo>;
  let userAgentRepo: ReturnType<typeof mockRepo>;
  let desktopPairRepo: any;

  beforeEach(async () => {
    userRepo = mockRepo();
    walletRepo = mockRepo();
    userAgentRepo = mockRepo();
    const desktopPairState = new Map<string, any>();
    desktopPairRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(desktopPairState.get(where?.sessionId) || null)),
      create: jest.fn().mockImplementation((dto: any) => ({
        id: dto.id || 'pair-record',
        createdAt: dto.createdAt || new Date(),
        updatedAt: dto.updatedAt || new Date(),
        ...dto,
      })),
      save: jest.fn().mockImplementation((entity: any) => {
        const next = {
          id: entity.id || 'pair-record',
          createdAt: entity.createdAt || new Date(),
          updatedAt: new Date(),
          ...entity,
        };
        desktopPairState.set(next.sessionId, next);
        return Promise.resolve(next);
      }),
      remove: jest.fn().mockImplementation((entity: any) => {
        if (entity?.sessionId) {
          desktopPairState.delete(entity.sessionId);
        }
        return Promise.resolve(entity);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(WalletConnection), useValue: walletRepo },
        { provide: getRepositoryToken(UserAgent), useValue: userAgentRepo },
        { provide: getRepositoryToken(DesktopPairSession), useValue: desktopPairRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AccountService, useValue: mockAccountService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should register a new user and return JWT', async () => {
      userRepo.findOne.mockResolvedValue(null); // no existing user
      userRepo.create.mockImplementation((dto: any) => ({ id: 'new-id', ...dto }));
      userRepo.save.mockImplementation((u: any) => Promise.resolve({ ...u, id: 'new-id' }));

      const result = await service.register({
        email: 'test@example.com',
        password: 'Secure123!',
      });

      expect(result.access_token).toBe('mock-jwt-token');
      expect(result.user.email).toBe('test@example.com');
      expect(userRepo.save).toHaveBeenCalled();
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
      );
    });

    it('should throw ConflictException if email already registered', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'existing', email: 'test@example.com' });

      await expect(
        service.register({ email: 'test@example.com', password: 'Secure123!' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should generate agentrixId if not provided', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockImplementation((dto: any) => ({ id: 'new-id', ...dto }));
      userRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      await service.register({ email: 'a@b.com', password: 'x' });

      const createArg = userRepo.create.mock.calls[0][0];
      expect(createArg.agentrixId).toMatch(/^AX-/);
    });
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should return JWT and user info', async () => {
      walletRepo.findOne.mockResolvedValue(null); // no default wallet

      const result = await service.login({
        id: 'user-1',
        email: 'test@example.com',
        agentrixId: 'AX-123',
        roles: [UserRole.USER],
      });

      expect(result.access_token).toBe('mock-jwt-token');
      expect(result.user.id).toBe('user-1');
      expect(result.user.walletAddress).toBeNull();
    });

    it('should include wallet address if default wallet exists', async () => {
      walletRepo.findOne.mockResolvedValue({
        walletAddress: '0xabc',
        isDefault: true,
      });

      const result = await service.login({
        id: 'user-1',
        email: 'test@example.com',
        agentrixId: 'AX-123',
        roles: [UserRole.USER],
      });

      expect(result.user.walletAddress).toBe('0xabc');
    });
  });

  // ── validateUser ──────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('should return user without passwordHash on valid credentials', async () => {
      // Our mock bcrypt.hash returns `hashed_<password>`, bcrypt.compare checks `hash === hashed_<plain>`
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: 'hashed_correct-pass',
        roles: [UserRole.USER],
      });

      const result = await service.validateUser('test@example.com', 'correct-pass');
      expect(result).toBeDefined();
      expect(result.id).toBe('u1');
      expect(result.passwordHash).toBeUndefined();
    });

    it('should return null on invalid password', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: 'hashed_correct-pass',
      });

      const result = await service.validateUser('test@example.com', 'wrong-pass');
      expect(result).toBeNull();
    });

    it('should return null if user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const result = await service.validateUser('no@user.com', 'pass');
      expect(result).toBeNull();
    });
  });

  // ── Wallet Login Challenge ────────────────────────────────────────────────

  describe('issueWalletLoginChallenge', () => {
    it('should return challenge with nonce and message', () => {
      const result = service.issueWalletLoginChallenge('0x1234567890abcdef1234567890abcdef12345678');
      expect(result.nonce).toBeDefined();
      expect(result.message).toContain('Sign this message');
      expect(result.message).toContain('0x1234567890abcdef1234567890abcdef12345678');
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  // ── Email OTP Login ───────────────────────────────────────────────────────

  describe('sendEmailVerificationCode', () => {
    it('should store a code and return success', async () => {
      // No email provider configured in test, but dev mode doesn't throw
      process.env.NODE_ENV = 'development';
      const result = await service.sendEmailVerificationCode('user@test.com');
      expect(result.success).toBe(true);
    });

    it('should reject rapid re-sends', async () => {
      process.env.NODE_ENV = 'development';
      await service.sendEmailVerificationCode('rapid@test.com');
      await expect(
        service.sendEmailVerificationCode('rapid@test.com'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyEmailCodeAndLogin', () => {
    it('should reject if no code exists', async () => {
      await expect(
        service.verifyEmailCodeAndLogin('nocode@test.com', '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should login successfully with correct code', async () => {
      process.env.NODE_ENV = 'development';
      await service.sendEmailVerificationCode('otp@test.com');

      // Extract code from internal map via a second send attempt timing
      // We need to access the private map — use reflection
      const emailCodes = (service as any).emailCodes as Map<string, any>;
      const stored = emailCodes.get('otp@test.com');
      expect(stored).toBeDefined();

      userRepo.findOne.mockResolvedValue(null); // new user
      userRepo.create.mockImplementation((dto: any) => ({ id: 'new-otp-user', ...dto }));
      userRepo.save.mockImplementation((u: any) => Promise.resolve({ ...u, id: 'new-otp-user' }));
      walletRepo.findOne.mockResolvedValue(null);

      const result = await service.verifyEmailCodeAndLogin('otp@test.com', stored.code);
      expect(result.access_token).toBe('mock-jwt-token');
    });

    it('should reject wrong code', async () => {
      process.env.NODE_ENV = 'development';
      await service.sendEmailVerificationCode('wrong@test.com');

      await expect(
        service.verifyEmailCodeAndLogin('wrong@test.com', '000000'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Desktop Pair ──────────────────────────────────────────────────────────

  describe('desktopPair', () => {
    it('should create and poll a pair session', async () => {
      const created = await service.createDesktopPairSession('session-abc');
      expect(created.sessionId).toBe('session-abc');
      expect(created.expiresAt).toBeGreaterThan(Date.now());

      const poll1 = await service.pollDesktopPairSession('session-abc');
      expect(poll1.resolved).toBe(false);
    });

    it('should return false for unknown session', async () => {
      const poll = await service.pollDesktopPairSession('unknown');
      expect(poll.resolved).toBe(false);
    });

    it('should resolve after confirmDesktopPair', async () => {
      await service.createDesktopPairSession('pair-1');
      walletRepo.findOne.mockResolvedValue(null);

      await service.confirmDesktopPair('pair-1', {
        id: 'u1',
        email: 'test@test.com',
        agentrixId: 'AX-1',
        roles: [UserRole.USER],
      } as any);

      const poll = await service.pollDesktopPairSession('pair-1');
      expect(poll.resolved).toBe(true);
      expect(poll.token).toBe('mock-jwt-token');
    });

    it('should resolve after direct OAuth pair completion', async () => {
      await service.createDesktopPairSession('pair-oauth');

      const result = await service.resolveDesktopPairSession('pair-oauth', 'oauth-jwt-token');

      expect(result.success).toBe(true);
      const poll = await service.pollDesktopPairSession('pair-oauth');
      expect(poll.resolved).toBe(true);
      expect(poll.token).toBe('oauth-jwt-token');
    });

    it('should throw if session not found on confirm', async () => {
      await expect(
        service.confirmDesktopPair('nope', { id: 'u1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if session not found on direct OAuth completion', async () => {
      await expect(service.resolveDesktopPairSession('missing', 'token')).rejects.toThrow(BadRequestException);
    });
  });

  // ── OAuth validation ──────────────────────────────────────────────────────

  describe('validateGoogleUser', () => {
    it('should create new user if not exists', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockImplementation((dto: any) => ({ id: 'g-user', ...dto }));
      userRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.validateGoogleUser({
        googleId: 'g-123',
        email: 'google@test.com',
        firstName: 'Test',
        lastName: 'User',
        picture: 'https://pic.url',
      });

      expect(result.googleId).toBe('g-123');
      expect(result.email).toBe('google@test.com');
    });

    it('should update existing user with googleId if missing', async () => {
      const existing = {
        id: 'e1',
        email: 'google@test.com',
        googleId: null,
        avatarUrl: null,
        nickname: null,
      };
      userRepo.findOne.mockResolvedValue(existing);
      userRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.validateGoogleUser({
        googleId: 'g-456',
        email: 'google@test.com',
        firstName: 'Test',
        lastName: 'User',
        picture: 'https://pic.url',
      });

      expect(userRepo.save).toHaveBeenCalled();
      expect(existing.googleId).toBe('g-456');
    });
  });

  describe('validateTwitterUser', () => {
    it('should create new user for twitter login', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockImplementation((dto: any) => ({ id: 'tw-user', ...dto }));
      userRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.validateTwitterUser({
        twitterId: 'tw-123',
        email: null,
        username: 'testuser',
        displayName: 'Test User',
        picture: 'https://pic.url',
      });

      expect(result.twitterId).toBe('tw-123');
    });
  });

  // ── validateAppleUser ───────────────────────────────────────────────────

  describe('validateAppleUser', () => {
    it('should create new user for apple login', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockImplementation((dto: any) => ({ id: 'apple-user', ...dto }));
      userRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.validateAppleUser({
        appleId: 'apple-001',
        email: 'apple@icloud.com',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.appleId).toBe('apple-001');
      expect(result.email).toBe('apple@icloud.com');
      expect(userRepo.save).toHaveBeenCalled();
    });

    it('should update existing user with appleId if missing', async () => {
      const existing = {
        id: 'e1',
        email: 'apple@icloud.com',
        appleId: null,
        nickname: null,
      };
      userRepo.findOne.mockResolvedValue(existing);
      userRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.validateAppleUser({
        appleId: 'apple-002',
        email: 'apple@icloud.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      expect(existing.appleId).toBe('apple-002');
      expect(existing.nickname).toBe('Jane Doe');
      expect(userRepo.save).toHaveBeenCalled();
    });

    it('should not overwrite existing nickname', async () => {
      const existing = {
        id: 'e2',
        email: 'apple@icloud.com',
        appleId: null,
        nickname: 'Existing Name',
      };
      userRepo.findOne.mockResolvedValue(existing);
      userRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      await service.validateAppleUser({
        appleId: 'apple-003',
        email: 'apple@icloud.com',
        firstName: 'New',
        lastName: 'Name',
      });

      expect(existing.nickname).toBe('Existing Name');
    });
  });

  // ── socialTokenLogin (Apple) ────────────────────────────────────────────

  describe('socialTokenLogin — Apple', () => {
    // Helper to create a fake Apple identity token JWT
    function fakeAppleJwt(payload: Record<string, any>): string {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
      const body = Buffer.from(JSON.stringify({
        iss: 'https://appleid.apple.com',
        aud: 'com.agentrix.app',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'apple-sub-001',
        email: 'native@apple.com',
        ...payload,
      })).toString('base64url');
      const sig = Buffer.from('fake-signature').toString('base64url');
      return `${header}.${body}.${sig}`;
    }

    it('should login with valid Apple identity token (new user)', async () => {
      userRepo.findOne.mockResolvedValue(null); // no existing user
      userRepo.create.mockImplementation((dto: any) => ({ id: 'apple-new', ...dto }));
      userRepo.save.mockImplementation((u: any) => Promise.resolve({ ...u, id: 'apple-new' }));
      walletRepo.findOne.mockResolvedValue(null);

      const token = fakeAppleJwt({ sub: 'apple-sub-001', email: 'native@apple.com' });
      const result = await service.socialTokenLogin({
        provider: 'apple',
        accessToken: token,
      });

      expect(result.access_token).toBe('mock-jwt-token');
      expect(result.user).toBeDefined();
    });

    it('should reject expired Apple identity token', async () => {
      const token = fakeAppleJwt({
        sub: 'apple-sub-expired',
        exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
      });

      await expect(
        service.socialTokenLogin({ provider: 'apple', accessToken: token }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject token with wrong issuer', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const body = Buffer.from(JSON.stringify({
        iss: 'https://evil.com',
        sub: 'bad-sub',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64url');
      const sig = Buffer.from('sig').toString('base64url');
      const token = `${header}.${body}.${sig}`;

      await expect(
        service.socialTokenLogin({ provider: 'apple', accessToken: token }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject malformed token', async () => {
      await expect(
        service.socialTokenLogin({ provider: 'apple', accessToken: 'not-a-jwt' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── Wallet Management ─────────────────────────────────────────────────────

  describe('removeWalletConnection', () => {
    it('should throw NotFoundException if wallet not found', async () => {
      walletRepo.findOne.mockResolvedValue(null);
      await expect(
        service.removeWalletConnection('user-1', 'wallet-99'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should remove wallet and promote next as default', async () => {
      walletRepo.findOne.mockResolvedValue({ id: 'w1', userId: 'u1', isDefault: true });
      walletRepo.find.mockResolvedValue([{ id: 'w2', isDefault: false }]);
      walletRepo.save.mockImplementation((e: any) => Promise.resolve(e));

      const result = await service.removeWalletConnection('u1', 'w1');
      expect(result.message).toContain('解绑');
      expect(walletRepo.remove).toHaveBeenCalled();
    });
  });

  describe('setDefaultWallet', () => {
    it('should throw NotFoundException if wallet not found', async () => {
      walletRepo.findOne.mockResolvedValue(null);
      await expect(
        service.setDefaultWallet('u1', 'w99'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set wallet as default', async () => {
      walletRepo.findOne.mockResolvedValue({ id: 'w1', userId: 'u1', isDefault: false });
      walletRepo.save.mockImplementation((e: any) => Promise.resolve(e));

      await service.setDefaultWallet('u1', 'w1');
      expect(walletRepo.update).toHaveBeenCalledWith({ userId: 'u1' }, { isDefault: false });
    });
  });
});
