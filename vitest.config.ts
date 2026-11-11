import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // packages/ui -> "unit" project; apps/storybook -> "storybook:light" and
    // "storybook:dark" projects (every story, once per theme)
    projects: ['packages/*', 'apps/*'],
  },
})
