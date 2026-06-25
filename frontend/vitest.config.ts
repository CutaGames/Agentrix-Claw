/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}', 'components/**/*.{test,spec}.{ts,tsx}', 'pages/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./__tests__/setup.ts'],
  },
});
