import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            const match = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
            if (match) {
              const packageName = match[1].replace('@', '_')
              return `vendor/${packageName}`
            }
            return 'vendor'
          }
        },
      },
    },
  },
})
