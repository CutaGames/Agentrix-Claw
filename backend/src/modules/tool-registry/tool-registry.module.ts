import { Module, Global, forwardRef } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ToolRegistryService } from './tool-registry.service';
import { AccountModule } from '../account/account.module';
import { OrderModule } from '../order/order.module';
import { ProductModule } from '../product/product.module';
import { CreateOrderTool } from './tools/commerce/create-order.tool';
import { ResourceSearchTool } from './tools/commerce/resource-search.tool';
import { SearchProductsTool } from './tools/commerce/search-products.tool';
import { AssetOverviewTool } from './tools/wallet/asset-overview.tool';
import { GetBalanceTool } from './tools/wallet/get-balance.tool';

@Global()
@Module({
  imports: [
    DiscoveryModule,
    forwardRef(() => ProductModule),
    forwardRef(() => OrderModule),
    forwardRef(() => AccountModule),
  ],
  providers: [
    ToolRegistryService,
    SearchProductsTool,
    ResourceSearchTool,
    CreateOrderTool,
    GetBalanceTool,
    AssetOverviewTool,
  ],
  exports: [ToolRegistryService],
})
export class ToolRegistryModule {}
