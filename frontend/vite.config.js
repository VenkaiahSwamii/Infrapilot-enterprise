import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://192.168.1.2:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://192.168.1.2:8080',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
