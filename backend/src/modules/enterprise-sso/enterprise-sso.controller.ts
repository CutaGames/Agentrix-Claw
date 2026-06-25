import { Controller, Get, Logger } from '@nestjs/common';

/**
 * Multi-Agent v2.1 P2 #16 — Enterprise SSO (scaffold only).
 *
 * Stub controller exposing read-only configuration discovery so a future
 * v2.4 sprint can plug in real SAML / OIDC handlers without rewriting the
 * route surface.
 *
 * Currently returns:
 *   - `enabled: false` unless `ENTERPRISE_SSO_ENABLED=1` (which still
 *     exposes an empty config — actual IdP integration happens in v2.4).
 *
 * Spec: MULTI_AGENT_V2_1_PRODUCT_DECISIONS §7.4 (deferred to v2.4).
 */
@Controller('enterprise/sso')
export class EnterpriseSsoController {
  private readonly logger = new Logger(EnterpriseSsoController.name);

  @Get('config')
  getConfig() {
    const enabled = process.env.ENTERPRISE_SSO_ENABLED === '1';
    if (!enabled) {
      return {
        enabled: false,
        message: 'Enterprise SSO ships in v2.4. Set ENTERPRISE_SSO_ENABLED=1 to enable scaffold endpoints.',
      };
    }
    return {
      enabled: true,
      providers: [
        // Real IdP entries land in v2.4 — see ENTERPRISE_SSO_DEPLOYMENT_GUIDE.md.
      ],
      message: 'Enterprise SSO scaffold enabled. v2.4 ships full SAML/OIDC handlers.',
    };
  }
}
