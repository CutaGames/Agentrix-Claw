import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LiquidityMeshService } from './liquidity-mesh.service';
import { BestExecutionService } from './best-execution.service';
import { JupiterAdapter } from './dex-adapters/jupiter.adapter';
import { UniswapAdapter } from './dex-adapters/uniswap.adapter';
import { RaydiumAdapter } from './dex-adapters/raydium.adapter';
import { PancakeSwapAdapter } from './dex-adapters/pancakeswap.adapter';
import { OpenOceanAdapter } from './dex-adapters/openocean.adapter';
import { AgentAuthorizationModule } from '../agent-authorization/agent-authorization.module';

@Module({
  imports: [HttpModule, AgentAuthorizationModule],
  providers: [
    LiquidityMeshService,
    BestExecutionService,
    JupiterAdapter,
    UniswapAdapter,
    RaydiumAdapter,
    PancakeSwapAdapter,
    OpenOceanAdapter,
  ],
  exports: [LiquidityMeshService, BestExecutionService],
})
export class LiquidityModule {}

