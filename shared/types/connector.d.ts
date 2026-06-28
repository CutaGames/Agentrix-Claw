export type ConnectorKind = 'builtin' | 'openapi' | 'mcp';
export type ConnectorAuthKind = 'none' | 'api_key' | 'bearer' | 'oauth';
export type ConnectorStatus = 'live' | 'beta' | 'coming_soon';
export type ConnectorCategory = 'productivity' | 'finance' | 'travel' | 'food' | 'shopping' | 'info' | 'dev' | 'social';
export interface ConnectorCatalogItem {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: ConnectorCategory;
    kind: ConnectorKind;
    status: ConnectorStatus;
    authKind: ConnectorAuthKind;
    authHeaderName?: string;
    reality?: boolean;
    chinaAvailable?: boolean;
    rewardAxp?: number;
    installed?: boolean;
    enabled?: boolean;
}
export interface ConnectorInstallInput {
    connectorId: string;
    credentials?: {
        apiKey?: string;
        headerName?: string;
        token?: string;
    };
}
export interface ConnectorInstallResult {
    ok: boolean;
    connectorId: string;
    installed: boolean;
    message: string;
    tools?: string[];
    needsOAuth?: boolean;
    authorizeUrl?: string;
}
export interface CalendarEmailReadout {
    kind: 'calendar' | 'email';
    count: number;
    items?: string[];
}
export interface AgentErrandResult {
    ok: boolean;
    connectorId: string;
    summary: string;
    data?: Record<string, unknown>;
    rewardAxp: number;
    bridged: boolean;
    balance?: number;
}
export declare const CONNECTOR_ERRAND_DEFAULT_REWARD = 10;
