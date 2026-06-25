import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { TaxRate } from '../../entities/tax-rate.entity';

export interface TaxCalculation {
  rate: number;
  amount: number;
  taxType: string;
}

@Injectable()
export class TaxService {
  constructor(
    @InjectRepository(TaxRate)
    private taxRateRepository: Repository<TaxRate>,
  ) {}

  /**
   * 获取税费率
   */
  async getTaxRate(
    countryCode: string,
    regionCode?: string,
    taxType?: string,
  ): Promise<TaxRate | null> {
    const today = new Date();
    const query = this.taxRateRepository
      .createQueryBuilder('tax_rate')
      .where('tax_rate.country_code = :countryCode', { countryCode })
      .andWhere('tax_rate.effective_date <= :today', { today })
      .andWhere(
        '(tax_rate.end_date IS NULL OR tax_rate.end_date >= :today)',
        { today },
      );

    if (regionCode) {
      query.andWhere('tax_rate.region_code = :regionCode', { regionCode });
    } else {
      query.andWhere('tax_rate.region_code IS NULL');
    }

    if (taxType) {
      query.andWhere('tax_rate.tax_type = :taxType', { taxType });
    }

    return query.orderBy('tax_rate.effective_date', 'DESC').getOne();
  }

  /**
   * 计算税费
   */
  async calculateTax(
    amount: number,
    countryCode: string,
    regionCode?: string,
  ): Promise<TaxCalculation> {
    // 1. 尝试获取VAT（优先）
    let taxRate = await this.getTaxRate(countryCode, regionCode, 'VAT');
    let taxType = 'VAT';

    // 2. 如果没有VAT，尝试GST
    if (!taxRate) {
      taxRate = await this.getTaxRate(countryCode, regionCode, 'GST');
      taxType = 'GST';
    }

    // 3. 如果还没有，尝试销售税
    if (!taxRate) {
      taxRate = await this.getTaxRate(countryCode, regionCode, 'SALES_TAX');
      taxType = 'SALES_TAX';
    }

    // 4. 如果都没有，返回0
    if (!taxRate) {
      return {
        rate: 0,
        amount: 0,
        taxType: 'NONE',
      };
    }

    const taxAmount = amount * Number(taxRate.rate);

    return {
      rate: Number(taxRate.rate),
      amount: taxAmount,
      taxType,
    };
  }

  /**
   * 生成税费报表
   */
  async generateTaxReport(
    merchantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    // TODO: 实现税费报表生成逻辑
    // 需要关联支付表，统计各国家的税费
    return {
      merchantId,
      startDate,
      endDate,
      totalTax: 0,
      breakdown: [],
    };
  }
}

