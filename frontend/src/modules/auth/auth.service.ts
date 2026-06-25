import { Injectable, ConflictException, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as ethers from 'ethers';
import { User, UserRole } from '../../entities/user.entity';
import { WalletConnection, WalletType, ChainType } from '../../entities/wallet-connection.entity';
import { RegisterDto, WalletLoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(WalletConnection)
    private walletRepository: Repository<WalletConnection>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // 检查用户是否已存在
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('该邮箱已被注册');
    }

    // 生成AX ID（如果未提供）
    const agentrixId = dto.agentrixId || `AX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 加密密码
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 创建用户
    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      agentrixId,
      roles: ['user'] as UserRole[],
    });

    const savedUser = await this.userRepository.save(user);

    // 生成JWT token
    const payload = { email: savedUser.email, sub: savedUser.id };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: savedUser.id,
        agentrixId: savedUser.agentrixId,
        email: savedUser.email,
        roles: Array.isArray(savedUser.roles) ? savedUser.roles : ['user'],
      },
    };
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (user && await bcrypt.compare(password, user.passwordHash)) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * 通过邮箱查找用户
   */
  async findUserByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        agentrixId: user.agentrixId,
        email: user.email,
        roles: user.roles,
      },
    };
  }

  async validateGoogleUser(googleProfile: any) {
    const { googleId, email, firstName, lastName, picture } = googleProfile;

    // 查找是否已有用户（通过 googleId 或 email）
    let user = await this.userRepository.findOne({
      where: [{ googleId }, { email }],
    });

    if (user) {
      // 如果用户存在但没有 googleId，更新它
      if (!user.googleId) {
        user.googleId = googleId;
        if (picture && !user.avatarUrl) {
          user.avatarUrl = picture;
        }
        if (firstName && lastName && !user.nickname) {
          user.nickname = `${firstName} ${lastName}`;
        }
        await this.userRepository.save(user);
      }
    } else {
      // 创建新用户
      const agentrixId = `AX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      user = this.userRepository.create({
        googleId,
        email,
        agentrixId,
        avatarUrl: picture,
        nickname: firstName && lastName ? `${firstName} ${lastName}` : null,
        roles: [UserRole.USER],
      });
      user = await this.userRepository.save(user);
    }

    return user;
  }

  /**
   * 钱包登录
   * 核心逻辑：同一个钱包地址只能有一个AX ID
   * 同一个AX ID可以绑定多个链的钱包
   */
  async walletLogin(dto: WalletLoginDto) {
    const { walletAddress, walletType, chain, message, signature, chainId } = dto;
    const normalizedAddress = walletAddress.toLowerCase();

    // 1. 验证地址格式
    this.validateWalletAddress(walletAddress, chain as ChainType);

    // 2. 验证签名（必须验证，不能跳过）
    const isValidSignature = await this.verifyWalletSignature(
      walletAddress,
      chain as ChainType,
      message,
      signature,
    );

    if (!isValidSignature) {
      throw new UnauthorizedException('签名验证失败，请重新签名');
    }

    // 3. 查找该钱包地址是否已存在（不区分链，因为同一个地址在不同链上应该对应同一个用户）
    // 注意：这里查找所有链的钱包连接，因为同一个地址在不同链上应该对应同一个AX ID
    const existingWallet = await this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoinAndSelect('wallet.user', 'user')
      .where('LOWER(wallet.walletAddress) = LOWER(:walletAddress)', {
        walletAddress: walletAddress,
      })
      .getOne();

    let user: User;
    let walletConnection: WalletConnection;

    if (existingWallet) {
      // 4a. 如果钱包已存在，使用现有的用户和AX ID
      user = existingWallet.user;
      
      // 检查该链的钱包连接是否已存在
      walletConnection = existingWallet;
      walletConnection.walletAddress = normalizedAddress;
      walletConnection.lastUsedAt = new Date();
      walletConnection.walletType = walletType as WalletType;
      walletConnection.chain = chain as ChainType;
      walletConnection.chainId = chainId;
      walletConnection = await this.walletRepository.save(walletConnection);
    } else {
      // 4b. 如果钱包不存在，创建新用户和钱包连接
      // 生成AX ID
      const agentrixId = `AX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 创建用户
      user = this.userRepository.create({
        agentrixId,
        roles: [UserRole.USER],
      });
      user = await this.userRepository.save(user);

      // 创建钱包连接
      walletConnection = this.walletRepository.create({
        userId: user.id,
        walletType: walletType as WalletType,
        walletAddress: normalizedAddress,
        chain: chain as ChainType,
        chainId,
        isDefault: true, // 第一个钱包设为默认
      });
      walletConnection = await this.walletRepository.save(walletConnection);
    }

    const defaultWalletCount = await this.walletRepository.count({
      where: { userId: user.id, isDefault: true },
    });

    if (defaultWalletCount === 0 && walletConnection && !walletConnection.isDefault) {
      walletConnection.isDefault = true;
      walletConnection = await this.walletRepository.save(walletConnection);
    }

    // 5. 生成JWT token
    const payload = { 
      sub: user.id,
      agentrixId: user.agentrixId,
      walletAddress: walletAddress.toLowerCase(),
    };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: user.id,
        agentrixId: user.agentrixId,
        email: user.email,
        roles: Array.isArray(user.roles) ? user.roles : [UserRole.USER],
      },
      wallet: {
        id: walletConnection.id,
        walletAddress: walletConnection.walletAddress,
        walletType: walletConnection.walletType,
        chain: walletConnection.chain,
        isDefault: walletConnection.isDefault,
      },
    };
  }

  async getWalletConnections(userId: string) {
    return this.walletRepository.find({
      where: { userId },
      order: { connectedAt: 'DESC' },
    });
  }

  async bindWallet(userId: string, dto: WalletLoginDto) {
    const { walletAddress, walletType, chain, message, signature, chainId } = dto;
    const normalizedAddress = walletAddress.toLowerCase();

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    this.validateWalletAddress(walletAddress, chain as ChainType);

    const isValidSignature = await this.verifyWalletSignature(
      walletAddress,
      chain as ChainType,
      message,
      signature,
    );

    if (!isValidSignature) {
      throw new UnauthorizedException('签名验证失败，请重新签名');
    }

    const existingWallet = await this.walletRepository
      .createQueryBuilder('wallet')
      .where('LOWER(wallet.walletAddress) = LOWER(:walletAddress)', { walletAddress })
      .getOne();

    if (existingWallet && existingWallet.userId !== userId) {
      throw new ConflictException('该钱包地址已绑定其他账号');
    }

    let walletConnection: WalletConnection;

    if (existingWallet) {
      walletConnection = existingWallet;
      walletConnection.walletType = walletType as WalletType;
      walletConnection.chain = chain as ChainType;
      walletConnection.chainId = chainId;
      walletConnection.lastUsedAt = new Date();
      walletConnection = await this.walletRepository.save(walletConnection);
    } else {
      const walletCount = await this.walletRepository.count({ where: { userId } });
      walletConnection = this.walletRepository.create({
        userId,
        walletType: walletType as WalletType,
        walletAddress: normalizedAddress,
        chain: chain as ChainType,
        chainId,
        isDefault: walletCount === 0,
      });
      walletConnection = await this.walletRepository.save(walletConnection);
    }

    return {
      wallet: {
        id: walletConnection.id,
        walletAddress: walletConnection.walletAddress,
        walletType: walletConnection.walletType,
        chain: walletConnection.chain,
        isDefault: walletConnection.isDefault,
      },
    };
  }

  async removeWalletConnection(userId: string, walletId: string) {
    const walletConnection = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!walletConnection) {
      throw new NotFoundException('未找到钱包连接');
    }

    await this.walletRepository.remove(walletConnection);

    const remainingWallets = await this.walletRepository.find({
      where: { userId },
      order: { connectedAt: 'DESC' },
    });

    if (remainingWallets.length > 0 && !remainingWallets.some((w) => w.isDefault)) {
      remainingWallets[0].isDefault = true;
      await this.walletRepository.save(remainingWallets[0]);
    }

    return { message: '钱包已解绑' };
  }

  async setDefaultWallet(userId: string, walletId: string) {
    const walletConnection = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!walletConnection) {
      throw new NotFoundException('未找到钱包连接');
    }

    await this.walletRepository.update({ userId }, { isDefault: false });
    walletConnection.isDefault = true;
    return this.walletRepository.save(walletConnection);
  }

  /**
   * 验证钱包签名
   */
  private async verifyWalletSignature(
    walletAddress: string,
    chain: ChainType,
    message: string,
    signature: string,
  ): Promise<boolean> {
    try {
      if (chain === ChainType.EVM) {
        // EVM地址签名验证
        const recoveredAddress = ethers.verifyMessage(message, signature);
        return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
      } else if (chain === ChainType.SOLANA) {
        // Solana地址签名验证（需要实现）
        // TODO: 实现Solana签名验证
        // 暂时返回true（开发环境）
        console.warn('Solana签名验证待实现');
        return true;
      }
      return false;
    } catch (error) {
      console.error('签名验证错误:', error);
      return false;
    }
  }

  /**
   * 验证钱包地址格式
   */
  private validateWalletAddress(address: string, chain: ChainType) {
    if (chain === ChainType.EVM) {
      if (!ethers.isAddress(address)) {
        throw new BadRequestException('无效的EVM地址');
      }
    } else if (chain === ChainType.SOLANA) {
      // Solana地址验证（通常是base58编码，32-44字符）
      if (address.length < 32 || address.length > 44) {
        throw new BadRequestException('无效的Solana地址');
      }
    } else {
      throw new BadRequestException('不支持的链类型');
    }
  }
}

