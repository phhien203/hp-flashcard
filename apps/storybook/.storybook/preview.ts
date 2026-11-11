import type { Preview } from '@storybook/react-vite'

import './preview.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Any axe violation fails the story's test (locally and in CI).
      test: 'error',
    },
  },
}

export default preview
