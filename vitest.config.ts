import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // packages/ui -> "unit" project, apps/storybook -> "storybook" project
    projects: ['packages/*', 'apps/*'],
  },
})
