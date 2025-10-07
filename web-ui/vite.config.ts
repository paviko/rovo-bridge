import {defineConfig} from 'vite'

// Vite config to build the UI directly into the Go embed directory
export default defineConfig(() => {
  const env = (globalThis as any).process?.env ?? {}
  const smFlag = String(env.SOURCEMAP || '').toLowerCase()
  const sourcemap = ['1', 'true', 'yes', 'on'].includes(smFlag)
  return {
    base: './',
    css: { devSourcemap: true },
    build: {
      outDir: '../backend/internal/httpapi/ui',
      emptyOutDir: true,
      assetsDir: '.',
      sourcemap,
      rollupOptions: {
        input: 'index.html'
      }
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts']
    }
  }
})
