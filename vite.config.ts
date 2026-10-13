import { defineConfig } from 'vite'

// GitHub Pages 项目页部署在 /legend/ 子路径下；本地 dev 仍用根路径
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/legend/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          colyseus: ['colyseus.js']
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
}))