import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  // Stories live next to their components in packages/ui.
  stories: [
    '../../../packages/ui/src/**/*.mdx',
    '../../../packages/ui/src/**/*.stories.@(ts|tsx)',
  ],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  framework: '@storybook/react-vite',
  core: {
    disableTelemetry: true,
  },
}

export default config
