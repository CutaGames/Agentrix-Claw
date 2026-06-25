import {
  REVENUE_SHARE_FIRST_SALE,
  REVENUE_SHARE_SECONDARY_SALE,
} from '../../../../shared/types/world-creation';

/**
 * 统一抽成模型(world-creation-feed task 12.3 / 10.1)。
 *
 * spec: 需求 7.4(一级/二级销售抽成)/ 12.3(统一 marketplace/货币抽成模型)。
 * 复用 v6 费率常量(REVENUE_SHARE_FIRST_SALE=5% / SECONDARY=30%),把"一级 vs 二级"
 * 判定收敛到单一纯函数,供 Agent 网关结算(10.1)与 marketplace 交易共用,避免双算。
 *
 * 判定:owner === originalCreator → 一级销售(首创者自售,5%);否则二级(转手,30%)。
 */

/** 抽成档位。 */
export type SaleType = 'first' | 'secondary';

/** 由 owner/originalCreator 关系判定销售档位。 */
export function resolveSaleType(
  ownerAccountId: string,
  originalCreatorAccountId: string,
): SaleType {
  return ownerAccountId === originalCreatorAccountId ? 'first' : 'secondary';
}

/** 档位对应费率。 */
export function revenueShareRate(saleType: SaleType): number {
  return saleType === 'first'
    ? REVENUE_SHARE_FIRST_SALE
    : REVENUE_SHARE_SECONDARY_SALE;
}

/** 计算平台抽成(6 位小数定点);amount<=0 返回 0。 */
export function platformCutOf(
  amount: number,
  ownerAccountId: string,
  originalCreatorAccountId: string,
): number {
  if (!(amount > 0)) return 0;
  const rate = revenueShareRate(
    resolveSaleType(ownerAccountId, originalCreatorAccountId),
  );
  return Math.round(amount * rate * 1e6) / 1e6;
}
