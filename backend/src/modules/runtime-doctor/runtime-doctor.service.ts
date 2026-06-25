import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DesktopUpdateService } from '../desktop-update/desktop-update.service';
import { buildChatPathParityReport, ChatPathParityReport } from '../query-engine/chat-path-parity.contract';
import { ToolControlPlaneService } from '../tool-control-plane/tool-control-plane.service';

export type RuntimeDoctorStatus = 'pass' | 'warn' | 'fail';

export interface AgentRuntimeConfig {
  provider?: string;
  model?: string;
  backend?: string;
  authProfile?: string;
  endpoint?: string;
  fallbackPolicy?: {
    enabled?: boolean;
    models?: string[];
    providers?: string[];
  };
  reasoningMode?: 'off' | 'summary' | 'full';
  streamingCapability?: 'required' | 'preferred' | 'unsupported';
}

export interface RuntimeDoctorCheck {
  id: string;
  title: string;
  status: RuntimeDoctorStatus;
  message: string;
  details?: Record<string, any>;
  remediation?: string;
}

export interface RuntimeDoctorReport {
  generatedAt: string;
  overallStatus: RuntimeDoctorStatus;
  checks: RuntimeDoctorCheck[];
  chatPathParity: ChatPathParityReport;
}

@Injectable()
export class RuntimeDoctorService {
  constructor(
    private readonly configService: ConfigService,
    // Kept for module wiring; the doctor's check is now env-only since the
    // DB-backed manifest lookup is async (Sprint G-2 / US-G2-2).
    private readonly desktopUpdateService: DesktopUpdateService,
    @Optional()
    private readonly toolControlPlaneService?: ToolControlPlaneService,
  ) {
    void this.desktopUpdateService;
  }

  runDoctor(options: { runtimeConfig?: AgentRuntimeConfig; currentDesktopVersion?: string } = {}): RuntimeDoctorReport {
    const checks: RuntimeDoctorCheck[] = [
      this.checkWindowsSigning(),
      this.checkDesktopUpdater(options.currentDesktopVersion || '0.0.0'),
      this.checkRuntimeMigration(options.runtimeConfig || this.runtimeConfigFromEnv()),
      this.checkProviderFallback(options.runtimeConfig || this.runtimeConfigFromEnv()),
      ...this.checkToolControlPlane(),
    ];

    const chatPathParity = buildChatPathParityReport();
    checks.push({
      id: 'chat-path-parity',
      title: 'Chat path parity',
      status: chatPathParity.isParity ? 'pass' : 'fail',
      message: chatPathParity.isParity
        ? 'Canonical tool and stream event contracts are identical for /openclaw/proxy/:id/stream and /claude/chat.'
        : 'One chat path is missing canonical tools or has extra untracked tools.',
      details: {
        missingByPath: chatPathParity.missingByPath,
        extraByPath: chatPathParity.extraByPath,
        toolCount: chatPathParity.canonicalToolNames.length,
      },
      remediation: chatPathParity.isParity
        ? undefined
        : 'Update both runtime paths and the shared contract before shipping new tools.',
    });

    return {
      generatedAt: new Date().toISOString(),
      overallStatus: this.overallStatus(checks),
      checks,
      chatPathParity,
    };
  }

  private checkWindowsSigning(): RuntimeDoctorCheck {
    const requireSigning = this.configService.get<string>('REQUIRE_WINDOWS_SIGNING') === 'true';
    const thumbprint = this.configService.get<string>('WINDOWS_SIGNING_THUMBPRINT')
      || this.configService.get<string>('WINDOWS_CERT_THUMBPRINT');
    const hasSecret = !!(
      this.configService.get<string>('WINDOWS_SIGNING_CERTIFICATE_BASE64')
      || this.configService.get<string>('WINDOWS_SIGNING_PFX_BASE64')
      || thumbprint
    );

    if (requireSigning && !hasSecret) {
      return {
        id: 'desktop-windows-signing',
        title: 'Windows signing gate',
        status: 'fail',
        message: 'REQUIRE_WINDOWS_SIGNING=true but no Windows signing certificate/thumbprint is configured.',
        details: { requireSigning, hasThumbprint: !!thumbprint, hasSecret },
        remediation: 'Set WINDOWS_SIGNING_THUMBPRINT or CI signing certificate secrets before release build.',
      };
    }

    return {
      id: 'desktop-windows-signing',
      title: 'Windows signing gate',
      status: hasSecret ? 'pass' : 'warn',
      message: hasSecret
        ? 'Windows signing metadata is present.'
        : 'Windows signing is not configured; local unsigned builds are allowed but release builds should require signing.',
      details: { requireSigning, hasThumbprint: !!thumbprint, hasSecret },
    };
  }

  private checkDesktopUpdater(currentVersion: string): RuntimeDoctorCheck {
    const required = this.configService.get<string>('DESKTOP_UPDATE_REQUIRED') === 'true';
    // Sync probe — only look at env-side configuration. The DB-backed
    // release lookup (Sprint G-2 / US-G2-2) is async; doctor still answers
    // whether updater env vars are configured at all.
    const version = this.configService.get<string>('DESKTOP_UPDATE_VERSION')?.trim();
    const baseUrl = this.configService.get<string>('DESKTOP_UPDATE_BASE_URL')?.trim();
    const hasSig = !!this.configService.get<string>('DESKTOP_UPDATE_SIGNATURE_WINDOWS_X86_64')?.trim();
    const envManifestConfigured = !!version && !!baseUrl && hasSig;
    const status: RuntimeDoctorStatus = envManifestConfigured ? 'pass' : required ? 'fail' : 'warn';

    return {
      id: 'desktop-updater-manifest',
      title: 'Desktop updater manifest',
      status,
      message: envManifestConfigured
        ? `Updater env-config present for windows-x86_64 (version ${version}). DB-backed releases are checked at request time.`
        : 'Updater manifest env-config is incomplete; DB-backed releases may still be available at request time.',
      details: {
        required,
        currentVersion,
        envManifestConfigured,
        platform: 'windows-x86_64',
        envVersion: version,
      },
      remediation: envManifestConfigured ? undefined : 'Configure DESKTOP_UPDATE_VERSION, DESKTOP_UPDATE_BASE_URL, signed asset name, and platform signature, OR insert rows into agentrix_desktop.releases.',
    };
  }

  private checkRuntimeMigration(config: AgentRuntimeConfig): RuntimeDoctorCheck {
    const backend = String(config.backend || '').trim();
    if (backend === 'claude-cli') {
      return {
        id: 'agent-runtime-backend-alias',
        title: 'Runtime backend migration',
        status: 'fail',
        message: 'Legacy backend alias claude-cli is still configured and can break runtime startup after migration.',
        details: config as any,
        remediation: 'Migrate claude-cli to the registered agent runtime backend alias, then keep the old alias as a doctor-detected compatibility path only.',
      };
    }

    if (!backend) {
      return {
        id: 'agent-runtime-backend-alias',
        title: 'Runtime backend migration',
        status: 'warn',
        message: 'No explicit runtime backend is configured; default routing will be used.',
        details: config as any,
      };
    }

    return {
      id: 'agent-runtime-backend-alias',
      title: 'Runtime backend migration',
      status: 'pass',
      message: `Runtime backend ${backend} is explicitly configured.`,
      details: config as any,
    };
  }

  private checkProviderFallback(config: AgentRuntimeConfig): RuntimeDoctorCheck {
    const provider = String(config.provider || '').trim();
    const model = String(config.model || '').trim();
    const endpoint = String(config.endpoint || '').trim();
    const fallbackModels = config.fallbackPolicy?.models || [];
    const fallbackLoop = !!model && fallbackModels.includes(model);
    const customMissingEndpoint = provider === 'custom' && !endpoint;

    if (fallbackLoop || customMissingEndpoint) {
      return {
        id: 'provider-runtime-policy',
        title: 'Provider/runtime policy',
        status: 'fail',
        message: fallbackLoop
          ? 'Fallback policy loops back to the primary model.'
          : 'Custom provider is selected but endpoint is missing.',
        details: { provider, model, endpointPresent: !!endpoint, fallbackModels },
        remediation: 'Set a provider-aware endpoint and ensure fallback chains do not include the active model/provider pair.',
      };
    }

    if (!provider || !model) {
      return {
        id: 'provider-runtime-policy',
        title: 'Provider/runtime policy',
        status: 'warn',
        message: 'Provider or model is not fully structured; legacy route defaults may still be used.',
        details: { provider, model, endpointPresent: !!endpoint, fallbackModels },
      };
    }

    return {
      id: 'provider-runtime-policy',
      title: 'Provider/runtime policy',
      status: 'pass',
      message: 'Provider-aware runtime policy is structurally valid.',
      details: { provider, model, endpointPresent: !!endpoint, fallbackModels },
    };
  }

  private checkToolControlPlane(): RuntimeDoctorCheck[] {
    if (!this.toolControlPlaneService) {
      return [{
        id: 'tool-control-plane-policy',
        title: 'Tool control plane policy',
        status: 'warn',
        message: 'Tool control plane service is not available in this runtime context.',
        remediation: 'Import ToolControlPlaneModule before release readiness checks.',
      }];
    }

    return this.toolControlPlaneService.getReadinessChecks() as RuntimeDoctorCheck[];
  }

  private runtimeConfigFromEnv(): AgentRuntimeConfig {
    const fallbackModels = this.configService.get<string>('AGENT_RUNTIME_FALLBACK_MODELS')
      ?.split(',')
      .map(item => item.trim())
      .filter(Boolean);
    return {
      provider: this.configService.get<string>('AGENT_RUNTIME_PROVIDER'),
      model: this.configService.get<string>('AGENT_RUNTIME_MODEL'),
      backend: this.configService.get<string>('AGENT_RUNTIME_BACKEND'),
      authProfile: this.configService.get<string>('AGENT_RUNTIME_AUTH_PROFILE'),
      endpoint: this.configService.get<string>('AGENT_RUNTIME_ENDPOINT'),
      fallbackPolicy: fallbackModels?.length ? { enabled: true, models: fallbackModels } : undefined,
      reasoningMode: this.configService.get<any>('AGENT_RUNTIME_REASONING_MODE'),
      streamingCapability: this.configService.get<any>('AGENT_RUNTIME_STREAMING_CAPABILITY'),
    };
  }

  private overallStatus(checks: RuntimeDoctorCheck[]): RuntimeDoctorStatus {
    if (checks.some(check => check.status === 'fail')) return 'fail';
    if (checks.some(check => check.status === 'warn')) return 'warn';
    return 'pass';
  }
}