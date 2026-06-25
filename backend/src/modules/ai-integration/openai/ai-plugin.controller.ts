/**
 * AI Plugin Discovery Controller
 * 
 * Serves /.well-known/ai-plugin.json for ChatGPT GPTs plugin discovery
 * and /openapi.json for OpenAPI schema access
 */

import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../auth/decorators/public.decorator';

@ApiTags('AI Plugin Discovery')
@Controller()
@Public()
export class AiPluginController {
  private readonly logger = new Logger(AiPluginController.name);

  constructor(private configService: ConfigService) {}

  /**
   * ChatGPT Plugin Manifest
   * GET /.well-known/ai-plugin.json
   */
  @Get('.well-known/ai-plugin.json')
  @ApiOperation({ summary: 'ChatGPT Plugin Manifest for AI discovery' })
  @ApiResponse({ status: 200, description: 'AI plugin manifest' })
  getAiPluginManifest() {
    this.logger.log('AI Plugin manifest requested');

    const apiBaseUrl = this.configService.get('API_BASE_URL', 'https://api.agentrix.top');

    return {
      schema_version: 'v1',
      name_for_human: 'Agentrix Commerce',
      name_for_model: 'agentrix_commerce',
      description_for_human: 'Search the Agentrix Marketplace for AI skills, products, and services. Execute skills, manage revenue splits, budget pools, and milestone-based payouts. Supports crypto and fiat payments.',
      description_for_model: 'Use this plugin to interact with the Agentrix Commerce & Marketplace platform. You can: (1) search_marketplace - search for AI skills, products, services, and tasks; (2) execute_skill - run a skill by ID with optional payment; (3) publish_to_marketplace - list new items; (4) commerce - manage split plans, budget pools, milestones for multi-party revenue sharing; (5) split_plan - create/manage revenue distribution rules; (6) budget_pool - create/manage task budgets with milestone payouts; (7) milestone - manage work milestones within budget pools; (8) calculate_commerce_fees - calculate platform fees. Payment methods: wallet (free, user pays gas), balance, x402_auto (autonomous agent payment). Platform fee: 0.3% on splits, pure crypto is free.',
      auth: {
        type: 'service_http',
        authorization_type: 'bearer',
        verification_tokens: {
          openai: this.configService.get('OPENAI_PLUGIN_VERIFICATION_TOKEN', ''),
        },
      },
      api: {
        type: 'openapi',
        url: `${apiBaseUrl}/api/mcp/openapi.json`,
        is_user_authenticated: false,
      },
      logo_url: `${apiBaseUrl}/logo.png`,
      contact_email: 'support@agentrix.io',
      legal_info_url: 'https://www.agentrix.top/terms',
    };
  }
}
