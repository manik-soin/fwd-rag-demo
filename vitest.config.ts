import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.eval.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
