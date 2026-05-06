/**
 * Jest config — mobile (root) pure-logic SDK tests only.
 * RN/Expo component tests require jest-expo (deferred to Phase 2 sprint).
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/services/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react', esModuleInterop: true, module: 'commonjs', target: 'es2020', strict: false, skipLibCheck: true } }],
  },
  moduleNameMapper: {
    '^expo-secure-store$': '<rootDir>/src/services/__mocks__/expo-secure-store.ts',
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/services/__mocks__/asyncStorage.ts',
  },
};
