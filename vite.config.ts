import { defineConfig } from 'vitest/config'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const tlsPfxPath = path.resolve(__dirname, 'server/certs/localhost.pfx')
const httpsConfig = fs.existsSync(tlsPfxPath)
  ? { pfx: fs.readFileSync(tlsPfxPath), passphrase: 'suggestit' }
  : undefined

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    https: httpsConfig,
  },
  preview: {
    host: '0.0.0.0',
    https: httpsConfig,
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/**', 'e2e/**', 'server/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/context/**', 'src/data/**'],
      exclude: ['src/app/components/ui/**', 'src/styles/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
