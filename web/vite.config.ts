import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // 相对路径：本地 dev 与 GitHub Pages 项目页（/仓库名/）都能直接使用，无需填写仓库名
  base: './',
  server: {
    port: 5173,
    host: '0.0.0.0',
    open: false
  }
});
