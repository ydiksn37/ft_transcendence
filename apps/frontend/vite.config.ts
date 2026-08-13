import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@transcendence/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Docker コンテナ内でのプロキシ (VITE_DEV_PROXY_TARGET) または直接起動時のプロキシ
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})

