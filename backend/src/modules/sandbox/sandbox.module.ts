import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';
import { PaymentModule } from '../payment/payment.module';
import { OrderModule } from '../order/order.module';
import { ProductModule } from '../product/product.module';
import { SearchModule } from '../search/search.module';
import { SandboxInstance } from '../../entities/sandbox-instance.entity';
import { DockerSandboxService } from './docker-sandbox.service';
import { SandboxShellExecTool } from './tools/sandbox-shell-exec.tool';
import { SandboxFsReadTool } from './tools/sandbox-fs-read.tool';
import { SandboxFsWriteTool } from './tools/sandbox-fs-write.tool';

@Module({
  imports: [
    TypeOrmModule.forFeature([SandboxInstance]),
    forwardRef(() => PaymentModule),
    forwardRef(() => OrderModule),
    forwardRef(() => ProductModule),
    forwardRef(() => SearchModule),
  ],
  controllers: [SandboxController],
  providers: [
    SandboxService,
    DockerSandboxService,
    SandboxShellExecTool,
    SandboxFsReadTool,
    SandboxFsWriteTool,
  ],
  exports: [SandboxService, DockerSandboxService],
})
export class SandboxModule {}

