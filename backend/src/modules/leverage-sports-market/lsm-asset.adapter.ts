import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AxpService } from '../axp/axp.service';

/**
 * 资金标的抽象层。引擎只认「资产单位」，不直接耦合 AXP。
 * v1: AxpAssetAdapter（AXP 积分，不可提现）。v2: StablecoinAssetAdapter（法务前置）。
 *
 * 所有动作整数；ref 携带幂等键 + 业务类型，落 AXP ledger。
 */

/** 引擎注入令牌：order/vault 引擎依赖此令牌而非具体适配器，切标的仅换 provider。 */
export const LSM_ASSET_ADAPTER = Symbol('LSM_ASSET_ADAPTER');

export interface AssetRef {
  /** 幂等键（orderId / settlementId 等），重复调用不重复记账 */
  idemKey: string;
  /** 业务类型，落 note */
  kind: string;
  metadata?: Record<string, unknown>;
}

export interface AssetAdapter {
  unit(): 'AXP' | 'USDC';
  balanceOf(userId: string): Promise<number>;
  /** 扣减并锁定（下注保证金）— 失败抛错（余额不足等） */
  escrow(userId: string, amount: number, ref: AssetRef): Promise<void>;
  /** 退还（取消/退款/平局） */
  release(userId: string, amount: number, ref: AssetRef): Promise<void>;
  /** 入账（盈利派彩/赎回） */
  credit(userId: string, amount: number, ref: AssetRef): Promise<void>;
  /** 扣减（LP 出资存入） */
  debit(userId: string, amount: number, ref: AssetRef): Promise<void>;
}

/**
 * AXP 适配器。把引擎资金动作映射到 AxpService 的 spend/earn。
 *
 * 来源映射（见 axp.constants.ts）：
 *   escrow(下注保证金)  → spend  source=lsm_stake
 *   debit (LP 出资)     → spend  source=lsm_vault_deposit
 *   credit(派彩)        → earn   source=lsm_payout
 *   credit(赎回)        → earn   source=lsm_vault_redeem（按 kind 区分）
 *   release(退款)       → earn   source=lsm_refund
 *
 * 整数校验在此层强制；AxpService 内部各自开事务（P1 单侧用户记账即可原子）。
 */
@Injectable()
export class AxpAssetAdapter implements AssetAdapter {
  private readonly logger = new Logger(AxpAssetAdapter.name);

  constructor(private readonly axp: AxpService) {}

  unit(): 'AXP' | 'USDC' {
    return 'AXP';
  }

  async balanceOf(userId: string): Promise<number> {
    const v = await this.axp.getBalance(userId);
    return v.balance;
  }

  private assertInt(amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`asset amount must be a positive integer AXP, got ${amount}`);
    }
  }

  async escrow(userId: string, amount: number, ref: AssetRef): Promise<void> {
    this.assertInt(amount);
    await this.axp.spend({
      userId,
      source: 'lsm_stake',
      amount,
      refId: ref.idemKey,
      note: ref.kind,
      metadata: ref.metadata,
    });
  }

  async debit(userId: string, amount: number, ref: AssetRef): Promise<void> {
    this.assertInt(amount);
    await this.axp.spend({
      userId,
      source: 'lsm_vault_deposit',
      amount,
      refId: ref.idemKey,
      note: ref.kind,
      metadata: ref.metadata,
    });
  }

  async credit(userId: string, amount: number, ref: AssetRef): Promise<void> {
    this.assertInt(amount);
    const source = ref.kind === 'vault_redeem' ? 'lsm_vault_redeem' : 'lsm_payout';
    await this.axp.earn({
      userId,
      source,
      amount,
      refId: ref.idemKey,
      note: ref.kind,
      metadata: ref.metadata,
    });
  }

  async release(userId: string, amount: number, ref: AssetRef): Promise<void> {
    this.assertInt(amount);
    await this.axp.earn({
      userId,
      source: 'lsm_refund',
      amount,
      refId: ref.idemKey,
      note: ref.kind,
      metadata: ref.metadata,
    });
  }
}

/**
 * 稳定币适配器（P5，task 21）。引擎核心不变，仅切适配器即可把标的从 AXP 升级为 USDC。
 *
 * **默认关闭（法务前置门）**：仅当 `LSM_STABLECOIN_ENABLED=1` 且 `LSM_ASSET_UNIT=USDC`
 * 时才会被工厂选中；即便选中，在多链充提/金库国库（见 multichain-deposit-withdraw spec）
 * 接线完成前，所有资金动作抛 `STABLECOIN_TREASURY_UNWIRED`，避免误用真实资金。
 *
 * 接线点（后续）：escrow/debit/credit/release 应对接国库的链上/链下双分录与充提编排，
 * 维持与 AXP 路径一致的整数口径 + 幂等键语义。本类当前为安全占位，不持有任何私钥。
 */
@Injectable()
export class StablecoinAssetAdapter implements AssetAdapter {
  private readonly logger = new Logger(StablecoinAssetAdapter.name);

  unit(): 'AXP' | 'USDC' {
    return 'USDC';
  }

  private guard(): never {
    throw new BadRequestException('STABLECOIN_TREASURY_UNWIRED');
  }

  async balanceOf(_userId: string): Promise<number> {
    return 0;
  }
  async escrow(): Promise<void> {
    this.guard();
  }
  async release(): Promise<void> {
    this.guard();
  }
  async credit(): Promise<void> {
    this.guard();
  }
  async debit(): Promise<void> {
    this.guard();
  }
}

/**
 * 资产适配器工厂：按 env 选择标的。默认 AXP；稳定币须 `LSM_STABLECOIN_ENABLED=1`
 * 且 `LSM_ASSET_UNIT=USDC`（法务前置开关），否则一律回退 AXP。
 */
export function assetAdapterFactory(
  axp: AxpAssetAdapter,
  stable: StablecoinAssetAdapter,
): AssetAdapter {
  const enabled = process.env.LSM_STABLECOIN_ENABLED === '1';
  const unit = (process.env.LSM_ASSET_UNIT || 'AXP').toUpperCase();
  if (enabled && unit === 'USDC') return stable;
  return axp;
}
