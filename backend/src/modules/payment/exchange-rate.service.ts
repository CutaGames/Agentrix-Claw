import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: number;
  source: string;
}

export interface ExchangeRateLock {
  lockId: string;
  from: string;
  to: string;
  amount: number;
  rate: number;
  cryptoAmount: number;
  expiresAt: number;
  createdAt: number;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private rateCache: Map<string, { rate: number; timestamp: number }> = new Map();
  private rateLocks: Map<string, ExchangeRateLock> = new Map();
  private readonly CACHE_TTL = 60 * 1000; // 1分钟缓存

  constructor(private configService: ConfigService) {}

  /**
   * 获取实时汇率（支持多个数据源）
   */
  async getExchangeRate(
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number> {
    const cacheKey = `${fromCurrency}_${toCurrency}`;
    const cached = this.rateCache.get(cacheKey);

    // 检查缓存
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.rate;
    }

    try {
      // 尝试从CoinGecko获取
      const rate = await this.getRateFromCoinGecko(fromCurrency, toCurrency);
      this.rateCache.set(cacheKey, { rate, timestamp: Date.now() });
      return rate;
    } catch (error) {
      this.logger.warn(`从CoinGecko获取汇率失败: ${error.message}`);
    }

    try {
      // 尝试从Binance获取
      const rate = await this.getRateFromBinance(fromCurrency, toCurrency);
      this.rateCache.set(cacheKey, { rate, timestamp: Date.now() });
      return rate;
    } catch (error) {
      this.logger.warn(`从Binance获取汇率失败: ${error.message}`);
    }

    // 如果都失败，使用模拟汇率
    this.logger.warn(`使用模拟汇率: ${fromCurrency} -> ${toCurrency}`);
    return this.getMockRate(fromCurrency, toCurrency);
  }

  /**
   * 从CoinGecko获取汇率
   */
  private async getRateFromCoinGecko(
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    // 如果相同货币，直接返回1.0
    if (from === to) {
      return 1.0;
    }

    // CoinGecko API
    // 需要将货币代码转换为CoinGecko ID
    const coinGeckoIds: Record<string, string> = {
      // 稳定币
      USDC: 'usd-coin',
      USDT: 'tether',
      DAI: 'dai',
      BUSD: 'binance-usd',
      TUSD: 'true-usd',
      // 加密货币
      BTC: 'bitcoin',
      ETH: 'ethereum',
      BNB: 'binancecoin',
      SOL: 'solana',
      XRP: 'ripple',
      ADA: 'cardano',
      DOGE: 'dogecoin',
      // 法币（CoinGecko使用ISO 4217代码）
      USD: 'usd',
      EUR: 'eur',
      GBP: 'gbp',
      CNY: 'cny',
      JPY: 'jpy',
      SGD: 'sgd',
      HKD: 'hkd',
      KRW: 'krw',
      TWD: 'twd',
      THB: 'thb',
      MYR: 'myr',
      IDR: 'idr',
      PHP: 'php',
      VND: 'vnd',
      INR: 'inr',
      CAD: 'cad',
      AUD: 'aud',
      NZD: 'nzd',
      CHF: 'chf',
      NOK: 'nok',
      SEK: 'sek',
      DKK: 'dkk',
      PLN: 'pln',
      RUB: 'rub',
      MXN: 'mxn',
      BRL: 'brl',
      ARS: 'ars',
      CLP: 'clp',
      AED: 'aed',
      SAR: 'sar',
      ILS: 'ils',
      ZAR: 'zar',
      TRY: 'try',
    };

    const fromId = coinGeckoIds[from];
    const toId = coinGeckoIds[to];

    // CoinGecko simple/price 只支持加密货币 ID 作为 ids 参数
    // 如果 from 和 to 都是法币，CoinGecko simple/price 无法直接获取汇率
    // 我们检查是否至少有一个是加密货币（通常 CoinGecko ID 比较长，或者在特定列表中）
    const cryptoIds = ['bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple', 'cardano', 'dogecoin', 'usd-coin', 'tether', 'dai', 'binance-usd', 'true-usd'];
    const isFromCrypto = cryptoIds.includes(fromId);
    const isToCrypto = cryptoIds.includes(toId);

    if (!fromId || !toId || (!isFromCrypto && !isToCrypto)) {
      this.logger.debug(`CoinGecko simple/price 不支持法币对法币转换: ${from}->${to}，将尝试其他方式`);
      throw new Error(`不支持的货币对: ${fromCurrency} -> ${toCurrency}`);
    }

    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price`,
        {
          params: {
            ids: `${fromId},${toId}`,
            vs_currencies: 'usd',
          },
          timeout: 5000,
        },
      );

      const fromPrice = response.data[fromId]?.usd;
      const toPrice = response.data[toId]?.usd;

      if (!fromPrice || !toPrice) {
        throw new Error(`无法获取价格: ${fromId}=${fromPrice}, ${toId}=${toPrice}`);
      }

      // 计算汇率：fromPrice / toPrice
      // 例如：CNY -> USD
      // CNY价格 = 0.139 USD (1 CNY = 0.139 USD)
      // USD价格 = 1.0 USD (1 USD = 1.0 USD)
      // 汇率 = 0.139 / 1.0 = 0.139 (1 CNY = 0.139 USD)
      // 例如：BTC -> USD
      // BTC价格 = 60000 USD
      // USD价格 = 1.0 USD
      // 汇率 = 60000 / 1.0 = 60000 (1 BTC = 60000 USD)
      const rate = fromPrice / toPrice;

      this.logger.log(
        `CoinGecko rate: ${from} -> ${to} = ${rate.toFixed(6)} (fromPrice=${fromPrice}, toPrice=${toPrice})`,
      );

      return rate;
    } catch (error) {
      this.logger.error(`CoinGecko API错误: ${error.message}`);
      throw error;
    }
  }

  /**
   * 从Binance获取汇率
   */
  private async getRateFromBinance(
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    // 如果相同货币，直接返回1.0
    if (from === to) {
      return 1.0;
    }

    // Binance API
    // 构建交易对符号（Binance使用反向符号，例如BTCUSDT表示BTC/USDT）
    const symbol = `${from}${to}`;

    try {
      const response = await axios.get(
        `https://api.binance.com/api/v3/ticker/price`,
        {
          params: { symbol },
          timeout: 5000,
        },
      );

      const rate = parseFloat(response.data.price);
      this.logger.log(`Binance rate: ${from} -> ${to} = ${rate.toFixed(6)}`);
      return rate;
    } catch (error) {
      // 如果直接交易对不存在，尝试通过USDT中转
      try {
        // 获取 from/USDT 和 to/USDT 的价格
        const fromToUsdt = await this.getBinancePrice(`${from}USDT`);
        const toToUsdt = await this.getBinancePrice(`${to}USDT`);

        // 计算汇率：to / from
        // 例如：CNY -> USDT
        // CNY/USDT 不存在，但可以通过 USD 中转
        // 如果 from 是法币，需要特殊处理
        if (['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'INR'].includes(from)) {
          // 法币转加密货币：需要通过USD中转
          // 1 CNY = 0.139 USD, 1 USDT = 1 USD
          // 汇率 = 1 / 0.139 = 7.19 (1 CNY = 0.139 USDT)
          // 但Binance没有法币交易对，所以这里会失败，应该使用CoinGecko
          throw new Error(`Binance不支持法币交易对: ${from}${to}`);
        }

        const rate = fromToUsdt / toToUsdt;
        this.logger.log(
          `Binance rate (via USDT): ${from} -> ${to} = ${rate.toFixed(6)} (${from}/USDT=${fromToUsdt}, ${to}/USDT=${toToUsdt})`,
        );
        return rate;
      } catch (e) {
        this.logger.error(`Binance API错误: ${e.message}`);
        throw e;
      }
    }
  }

  /**
   * 从Binance获取价格
   */
  private async getBinancePrice(symbol: string): Promise<number> {
    const response = await axios.get(
      `https://api.binance.com/api/v3/ticker/price`,
      {
        params: { symbol },
        timeout: 5000,
      },
    );
    return parseFloat(response.data.price);
  }

  /**
   * 获取模拟汇率（fallback）
   * 包含主流法币与USD/USDT/USDC的兑换
   */
  private getMockRate(fromCurrency: string, toCurrency: string): number {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    // 如果相同货币，返回1.0
    if (from === to) {
      return 1.0;
    }

    // 定义基础汇率（相对于USD，即1 USD = X 该货币）
    const baseRates: Record<string, number> = {
      // ========== 主流法币 ==========
      'USD': 1.0,       // 基准货币
      'CNY': 7.2,       // 1 USD = 7.2 CNY (人民币)
      'EUR': 0.92,      // 1 USD = 0.92 EUR (欧元)
      'GBP': 0.79,      // 1 USD = 0.79 GBP (英镑)
      'JPY': 150.0,     // 1 USD = 150 JPY (日元)
      
      // ========== 亚洲货币 ==========
      'SGD': 1.35,      // 1 USD = 1.35 SGD (新加坡元)
      'HKD': 7.8,       // 1 USD = 7.8 HKD (港币)
      'KRW': 1350.0,    // 1 USD = 1350 KRW (韩元)
      'TWD': 32.0,      // 1 USD = 32 TWD (新台币)
      'THB': 36.0,      // 1 USD = 36 THB (泰铢)
      'MYR': 4.7,       // 1 USD = 4.7 MYR (马来西亚林吉特)
      'IDR': 15800.0,   // 1 USD = 15800 IDR (印尼盾)
      'PHP': 56.0,      // 1 USD = 56 PHP (菲律宾比索)
      'VND': 24500.0,   // 1 USD = 24500 VND (越南盾)
      'INR': 83.0,      // 1 USD = 83 INR (印度卢比)
      
      // ========== 欧洲货币 ==========
      'CHF': 0.88,      // 1 USD = 0.88 CHF (瑞士法郎)
      'NOK': 10.8,      // 1 USD = 10.8 NOK (挪威克朗)
      'SEK': 10.5,      // 1 USD = 10.5 SEK (瑞典克朗)
      'DKK': 6.9,       // 1 USD = 6.9 DKK (丹麦克朗)
      'PLN': 4.0,       // 1 USD = 4.0 PLN (波兰兹罗提)
      'RUB': 92.0,      // 1 USD = 92 RUB (俄罗斯卢布)
      
      // ========== 美洲货币 ==========
      'CAD': 1.35,      // 1 USD = 1.35 CAD (加元)
      'MXN': 17.0,      // 1 USD = 17 MXN (墨西哥比索)
      'BRL': 5.0,       // 1 USD = 5 BRL (巴西雷亚尔)
      'ARS': 850.0,     // 1 USD = 850 ARS (阿根廷比索)
      'CLP': 950.0,     // 1 USD = 950 CLP (智利比索)
      
      // ========== 大洋洲货币 ==========
      'AUD': 1.52,      // 1 USD = 1.52 AUD (澳元)
      'NZD': 1.65,      // 1 USD = 1.65 NZD (新西兰元)
      
      // ========== 中东/非洲货币 ==========
      'AED': 3.67,      // 1 USD = 3.67 AED (阿联酋迪拉姆)
      'SAR': 3.75,      // 1 USD = 3.75 SAR (沙特里亚尔)
      'ILS': 3.7,       // 1 USD = 3.7 ILS (以色列新谢克尔)
      'ZAR': 18.5,      // 1 USD = 18.5 ZAR (南非兰特)
      'TRY': 32.0,      // 1 USD = 32 TRY (土耳其里拉)
      
      // ========== 稳定币（与USD 1:1）==========
      'USDC': 1.0,
      'USDT': 1.0,
      'DAI': 1.0,
      'BUSD': 1.0,
      'TUSD': 1.0,
      
      // ========== 主流加密货币 ==========
      'BTC': 0.000016,  // 1 USD = 0.000016 BTC (约62,500 USD/BTC)
      'ETH': 0.0004,    // 1 USD = 0.0004 ETH (约2,500 USD/ETH)
      'BNB': 0.0016,    // 1 USD = 0.0016 BNB (约625 USD/BNB)
      'SOL': 0.01,      // 1 USD = 0.01 SOL (约100 USD/SOL)
      'XRP': 1.5,       // 1 USD = 1.5 XRP (约0.67 USD/XRP)
      'ADA': 1.2,       // 1 USD = 1.2 ADA (约0.83 USD/ADA)
      'DOGE': 8.0,      // 1 USD = 8 DOGE (约0.125 USD/DOGE)
    };

    // 获取基础汇率
    const fromRate = baseRates[from];
    const toRate = baseRates[to];

    // 如果货币不在列表中，尝试通过USD中转计算
    if (!fromRate || !toRate) {
      // 如果其中一个货币是USD/USDC/USDT，可以尝试反向计算
      if (['USD', 'USDC', 'USDT', 'DAI', 'BUSD', 'TUSD'].includes(from)) {
        // from是稳定币，to是未知货币，假设to相对于USD的汇率
        if (!toRate) {
          this.logger.warn(
            `Unknown currency ${to}, assuming 1 ${to} = 1 USD for calculation`,
          );
          return 1.0; // 默认1:1
        }
        // from是USD，to是已知货币
        return toRate;
      } else if (['USD', 'USDC', 'USDT', 'DAI', 'BUSD', 'TUSD'].includes(to)) {
        // to是稳定币，from是未知货币
        if (!fromRate) {
          this.logger.warn(
            `Unknown currency ${from}, assuming 1 ${from} = 1 USD for calculation`,
          );
          return 1.0; // 默认1:1
        }
        // to是USD，from是已知货币
        return 1.0 / fromRate;
      } else {
        // 两个都是未知货币，默认1:1
        this.logger.warn(
          `Unknown currency pair ${from} -> ${to}, using 1:1 rate`,
        );
        return 1.0;
      }
    }

    // 计算汇率：to / from
    // 例如：CNY -> USDT
    // CNY: 7.2 (1 USD = 7.2 CNY, 即 1 CNY = 1/7.2 USD)
    // USDT: 1.0 (1 USD = 1 USDT)
    // 汇率 = 1.0 / 7.2 = 0.139 (1 CNY = 0.139 USDT)
    const rate = toRate / fromRate;

    this.logger.warn(
      `Using mock rate: ${from} -> ${to} = ${rate.toFixed(6)} (1 ${from} = ${(1/fromRate).toFixed(6)} USD, 1 ${to} = ${(1/toRate).toFixed(6)} USD)`,
    );

    return rate;
  }

  /**
   * 批量获取汇率
   */
  async getExchangeRates(
    pairs: Array<{ from: string; to: string }>,
  ): Promise<ExchangeRate[]> {
    const results: ExchangeRate[] = [];

    for (const pair of pairs) {
      try {
        const rate = await this.getExchangeRate(pair.from, pair.to);
        results.push({
          from: pair.from,
          to: pair.to,
          rate,
          timestamp: Date.now(),
          source: 'coingecko',
        });
      } catch (error) {
        this.logger.error(
          `获取汇率失败: ${pair.from} -> ${pair.to}`,
          error,
        );
      }
    }

    return results;
  }

  /**
   * 锁定汇率（内存缓存版，后续可替换为Redis）
   */
  async lockExchangeRate(
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    expiresInSeconds = 600,
  ): Promise<ExchangeRateLock> {
    if (!amount || amount <= 0) {
      throw new Error('锁定汇率需要有效的金额');
    }

    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    const cryptoAmount = amount * rate;
    const lockId = `lock_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    const lock: ExchangeRateLock = {
      lockId,
      from: fromCurrency,
      to: toCurrency,
      amount,
      rate,
      cryptoAmount,
      expiresAt,
      createdAt: Date.now(),
    };

    this.rateLocks.set(lockId, lock);
    this.cleanupExpiredLocks();

    this.logger.debug(
      `Locked FX rate ${fromCurrency}->${toCurrency} @ ${rate} for amount ${amount}, lockId=${lockId}`,
    );

    return lock;
  }

  /**
   * 获取锁定汇率信息
   */
  getRateLock(lockId: string): ExchangeRateLock | undefined {
    this.cleanupExpiredLocks();
    return this.rateLocks.get(lockId);
  }

  /**
   * 验证锁定汇率是否仍然有效
   */
  validateRateLock(lockId: string): { valid: boolean; lock?: ExchangeRateLock } {
    this.cleanupExpiredLocks();
    const lock = this.rateLocks.get(lockId);
    if (!lock) {
      return { valid: false };
    }

    const valid = Date.now() <= lock.expiresAt;
    if (!valid) {
      this.rateLocks.delete(lockId);
    }

    return { valid, lock };
  }

  /**
   * 清理已过期的汇率锁
   */
  private cleanupExpiredLocks() {
    const now = Date.now();
    for (const [lockId, lock] of this.rateLocks.entries()) {
      if (now > lock.expiresAt) {
        this.rateLocks.delete(lockId);
      }
    }
  }
}

