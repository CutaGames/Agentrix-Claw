import { SetMetadata } from '@nestjs/common';

export const TOOL_METADATA_KEY = 'AGENTRIX_TOOL';

/**
 * Decorator to mark a class as a registerable AgentrixTool.
 * The class must implement the AgentrixTool interface.
 * It will be auto-discovered and registered at module init.
 */
export const RegisterTool = () => SetMetadata(TOOL_METADATA_KEY, true);
