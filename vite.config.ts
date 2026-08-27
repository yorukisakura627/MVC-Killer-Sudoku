import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Vite 配置：别名 @ 指向 src，便于模块导入
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
