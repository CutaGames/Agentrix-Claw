import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { ConsoleStub } from '../../../components/console/ConsoleStub';

export default function ConsoleMarketplacePlugins(): React.ReactElement {
  return (
    <ConsoleLayout title="Plugins / MCP">
      <ConsoleStub
        description="Browse and install MCP plugin servers. Backed by /api/v1/mcp-registry."
        eta="W22 (R2)"
        legacyHref="/plugins"
        legacyLabel="Open legacy plugins page"
      />
    </ConsoleLayout>
  );
}
