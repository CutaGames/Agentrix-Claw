/** Isolated Jest config for agent-experience/v1. Does not load the Expo root tsconfig. */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/__tests__/agent-experience.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
        tsconfig: {
          esModuleInterop: true,
          module: 'commonjs',
          target: 'es2020',
          strict: false,
          skipLibCheck: true,
          noEmit: true,
        },
      },
    ],
  },
};
