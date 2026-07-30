import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    isolate: false,
    maxWorkers: 1,
    retry: 0,
    testTimeout: 30_000,
  },
});
