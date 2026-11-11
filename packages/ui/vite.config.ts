import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

import { browserTestConfig } from '../../vitest.shared.ts'
import pkg from './package.json' with { type: 'json' }

// Everything the package depends on stays a bare import in dist/.
const externals = [
  ...Object.keys(pkg.dependencies),
  ...Object.keys(pkg.peerDependencies),
]
const isExternal = (id: string) =>
  externals.some((dep) => id === dep || id.startsWith(`${dep}/`))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2023',
    minify: false,
    sourcemap: true,
    emptyOutDir: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
    },
    rolldownOptions: {
      external: isExternal,
      output: {
        // One output file per source module so consumers' bundlers can tree-shake.
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
  test: {
    name: 'unit',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    browser: browserTestConfig(),
  },
})
