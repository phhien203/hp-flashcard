import type { Preview } from '@storybook/react-vite'

import './preview.css'
import { ThemedDocsContainer, withTheme } from './theme.tsx'

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Design-system theme (toggles `.dark` on the preview root)',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  decorators: [withTheme],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      container: ThemedDocsContainer,
    },
    a11y: {
      // Any axe violation fails the story's test (locally and in CI).
      test: 'error',
    },
  },
}

export default preview
