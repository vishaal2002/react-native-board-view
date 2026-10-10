import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  define: { __DEV__: 'true' },
  resolve: {
    alias: {
      'board-view-core': here('./packages/core/src/index.ts'),
      // Hook tests run in jsdom; they only need AccessibilityInfo from React Native.
      'react-native': here('./packages/react-native/test/react-native.stub.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
    environment: 'node',
  },
});
