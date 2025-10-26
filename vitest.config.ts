import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', '__tests__/**/*.test.ts'],
  },
});
