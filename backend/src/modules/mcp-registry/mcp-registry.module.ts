import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpServer } from '../../entities/mcp-server.entity';
import { McpServerRegistryService } from './mcp-server-registry.service';
import { McpServerRegistryController } from './mcp-server-registry.controller';

@Module({
  imports: [TypeOrmModule.forFeature([McpServer])],
  providers: [McpServerRegistryService],
  controllers: [McpServerRegistryController],
  exports: [McpServerRegistryService],
})
export class McpRegistryModule {}
