import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { defineConfig, mergeConfig } from 'vitest/config'

import { browserTestConfig } from '../../vitest.shared.ts'
import viteConfig from './vite.config.ts'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Runs every story as a test (render + play function + axe a11y checks).
export default mergeConfig(
  viteConfig,
  defineConfig({
    plugins: [
      storybookTest({
        configDir: path.join(dirname, '.storybook'),
        storybookScript: 'pnpm dev --ci',
      }),
    ],
    test: {
      name: 'storybook',
      browser: browserTestConfig(),
    },
  }),
)
