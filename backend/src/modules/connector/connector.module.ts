import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserConnector } from './user-connector.entity';
import { OAuthToken } from './oauth-token.entity';
import { ConnectorService } from './connector.service';
import { ConnectorOAuthService } from './connector-oauth.service';
import { CalendarEmailReadoutService } from './calendar-email-readout.service';
import { TokenCipher } from './token-cipher';
import { ConnectorController } from './connector.controller';
import { SkillModule } from '../skill/skill.module';
import { McpRegistryModule } from '../mcp-registry/mcp-registry.module';
import { AeonModule } from '../aeon/aeon.module';

/**
 * ConnectorModule — 连接器/插件库(目录 + 一键装 + 鉴权向导 + 玩法A闭环)。
 *
 * 复用:SkillModule(OpenAPI 导入;且 SkillExecutorService 反向注入 ConnectorService 暴露
 * connector_run/connector_errand agent 工具 → 用 forwardRef 打破循环)、
 * McpRegistryModule(MCP 注册/发现)、AeonModule(RealityLoop 发 AXP、WorldNews 写世界新闻)。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserConnector, OAuthToken]),
    forwardRef(() => SkillModule),
    McpRegistryModule,
    AeonModule,
  ],
  controllers: [ConnectorController],
  providers: [ConnectorService, ConnectorOAuthService, CalendarEmailReadoutService, TokenCipher],
  exports: [ConnectorService, ConnectorOAuthService, CalendarEmailReadoutService],
})
export class ConnectorModule {}
