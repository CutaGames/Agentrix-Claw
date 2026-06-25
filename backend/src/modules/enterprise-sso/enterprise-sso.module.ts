import { Module } from '@nestjs/common';
import { EnterpriseSsoController } from './enterprise-sso.controller';

/**
 * Multi-Agent v2.1 P2 #16 — Enterprise SSO scaffold module.
 *
 * Stub module hosting the `enterprise/sso/config` discovery endpoint.
 * Actual IdP integration ships in v2.4.
 */
@Module({
  controllers: [EnterpriseSsoController],
  providers: [],
  exports: [],
})
export class EnterpriseSsoModule {}
