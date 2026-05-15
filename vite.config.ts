import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@components': resolve('src/components'),
      '@features': resolve('src/features'),
      '@hooks': resolve('src/hooks'),
      '@types': resolve('src/types/index.ts'),
      '@utils': resolve('src/utils'),
      '@i18n': resolve('src/i18n'),
      '@contexts': resolve('src/contexts'),
    },
  },
});
