/**
 * AI 平台适配器接口
 * 
 * 将统一的产品能力转换为各平台特定的格式
 */

import { Product } from '../../../entities/product.entity';
import { FunctionSchema, AIPlatform } from '../interfaces/capability.interface';

import { SystemCapability } from '../interfaces/capability.interface';

export interface IPlatformAdapter {
  /**
   * 平台名称
   */
  platform: AIPlatform;

  /**
   * 将产品转换为平台特定的 Function Schema
   */
  convertProductToFunction(product: Product, capabilityType: string): FunctionSchema;

  /**
   * 批量转换产品
   */
  convertProductsToFunctions(products: Product[], capabilityType: string): FunctionSchema[];

  /**
   * 将系统级能力转换为平台特定的 Function Schema
   */
  convertSystemCapabilityToFunction(capability: SystemCapability): FunctionSchema;

  /**
   * 验证 Schema 格式
   */
  validateSchema(schema: FunctionSchema): boolean;
}


