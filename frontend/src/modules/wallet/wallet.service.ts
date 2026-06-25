import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletConnection, WalletType, ChainType } from '../../entities/wallet-connection.entity';
import { ConnectWalletDto, VerifySignatureDto } from './dto/wallet.dto';
import * as ethers from 'ethers';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletConnection)
    private walletRepository: Repository<WalletConnection>,
  ) {}

  async connectWallet(userId: string, dto: ConnectWalletDto) {
    // 验证地址格式
    this.validateAddress(dto.walletAddress, dto.chain);

    // 检查是否已连接
    const existing = await this.walletRepository.findOne({
      where: {
        userId,
        walletAddress: dto.walletAddress,
        chain: dto.chain,
      },
    });

    if (existing) {
      existing.lastUsedAt = new Date();
      return this.walletRepository.save(existing);
    }

    // 创建新连接
    const wallet = this.walletRepository.create({
      userId,
      walletType: dto.walletType,
      walletAddress: dto.walletAddress,
      chain: dto.chain,
      chainId: dto.chainId,
      isDefault: false,
    });

    // 如果是第一个钱包，设为默认
    const count = await this.walletRepository.count({ where: { userId } });
    if (count === 0) {
      wallet.isDefault = true;
    }

    return this.walletRepository.save(wallet);
  }

  async getUserWallets(userId: string) {
    return this.walletRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', lastUsedAt: 'DESC' },
    });
  }

  async setDefaultWallet(userId: string, walletId: string) {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('钱包不存在');
    }

    // 取消其他默认钱包
    await this.walletRepository.update(
      { userId, isDefault: true },
      { isDefault: false },
    );

    // 设置新的默认钱包
    wallet.isDefault = true;
    return this.walletRepository.save(wallet);
  }

  async disconnectWallet(userId: string, walletId: string) {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('钱包不存在');
    }

    await this.walletRepository.remove(wallet);

    // 如果断开的是默认钱包，设置新的默认钱包
    if (wallet.isDefault) {
      const remaining = await this.walletRepository.findOne({
        where: { userId },
      });
      if (remaining) {
        remaining.isDefault = true;
        await this.walletRepository.save(remaining);
      }
    }

    return { message: '钱包已断开连接' };
  }

  async verifySignature(userId: string, dto: VerifySignatureDto) {
    const wallet = await this.walletRepository.findOne({
      where: { id: dto.walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('钱包不存在');
    }

    try {
      if (wallet.chain === ChainType.EVM) {
        // EVM地址签名验证
        const recoveredAddress = ethers.verifyMessage(
          dto.message,
          dto.signature,
        );
        return {
          valid: recoveredAddress.toLowerCase() === wallet.walletAddress.toLowerCase(),
          address: recoveredAddress,
        };
      } else if (wallet.chain === ChainType.SOLANA) {
        // Solana地址签名验证（需要实现）
        // TODO: 实现Solana签名验证
        return { valid: false, error: 'Solana签名验证待实现' };
      }
    } catch (error) {
      throw new BadRequestException('签名验证失败: ' + error.message);
    }
  }

  private validateAddress(address: string, chain: ChainType) {
    if (chain === ChainType.EVM) {
      if (!ethers.isAddress(address)) {
        throw new BadRequestException('无效的EVM地址');
      }
    } else if (chain === ChainType.SOLANA) {
      // Solana地址验证（通常是base58编码，44字符）
      if (address.length < 32 || address.length > 44) {
        throw new BadRequestException('无效的Solana地址');
      }
    }
  }
}

