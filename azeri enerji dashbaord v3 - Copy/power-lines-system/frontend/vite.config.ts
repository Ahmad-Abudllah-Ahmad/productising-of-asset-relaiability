import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:8001', changeOrigin: true },
      '/health': { target: 'http://localhost:8001', changeOrigin: true },
      '/results': { target: 'http://localhost:8001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:8001', ws: true, changeOrigin: true },
    },
  },
  server: {
    port: 5173,
    host: true,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/results': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
