import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { defineConfig, mergeConfig } from 'vitest/config'

import { browserTestConfig } from '../../vitest.shared.ts'
import { THEMES, type Theme } from './.storybook/themes.ts'
import viteConfig from './vite.config.ts'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// One project per theme: every story is a test (render + play function + axe
// a11y checks) in light and again with `.dark` on the preview root, so an a11y
// violation in either theme fails the run.
const storybookProject = (theme: Theme) =>
  mergeConfig(
    viteConfig,
    defineConfig({
      plugins: [
        storybookTest({
          configDir: path.join(dirname, '.storybook'),
          storybookScript: 'pnpm dev --ci',
          initialGlobals: { theme },
        }),
      ],
      test: {
        name: `storybook:${theme}`,
        browser: browserTestConfig(),
      },
    }),
  )

export default defineConfig({
  test: {
    projects: THEMES.map((theme) => ({
      extends: false,
      ...storybookProject(theme),
      root: dirname,
    })),
  },
})
