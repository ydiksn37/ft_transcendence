import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@transcendence/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
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
      '/uploads': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // PixiJS is a tightly coupled renderer bundle. Splitting its circular
    // modules manually broke production initialization; the gzip payload is
    // ~217 kB, so use a limit that reflects the required renderer chunk.
    chunkSizeWarningLimit: 750,
  },
})
