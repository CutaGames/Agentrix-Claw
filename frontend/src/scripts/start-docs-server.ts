#!/usr/bin/env ts-node
import { startDocsServer } from '../modules/docs/docs-server';

startDocsServer().catch((error) => {
  console.error('Failed to start docs server:', error);
  process.exit(1);
});

