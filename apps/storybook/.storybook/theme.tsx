import {
  DocsContainer,
  type DocsContainerProps,
} from '@storybook/addon-docs/blocks'
import { useEffect, useState, type PropsWithChildren } from 'react'
import type { Decorator } from '@storybook/react-vite'
import { GLOBALS_UPDATED } from 'storybook/internal/core-events'
import { themes } from 'storybook/theming'

import type { Theme } from './themes.ts'

const toTheme = (value: unknown): Theme => (value === 'dark' ? 'dark' : 'light')

/**
 * The design system's dark tokens live under `.dark`. Put it on the preview
 * root so every story, portal and docs page inherits them.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

/** Applies the `theme` global (toolbar or Vitest project) to each story. */
export const withTheme: Decorator = (Story, { globals }) => {
  applyTheme(toTheme(globals.theme))
  return <Story />
}

// Not part of DocsContextProps' public type, but present at runtime.
type GlobalsStore = { userGlobals?: { get?: () => Record<string, unknown> } }

/**
 * Docs pages follow the toolbar too, including MDX pages without stories:
 * the docs chrome swaps Storybook's light and dark theme, and `.dark` goes on
 * the preview root.
 */
export function ThemedDocsContainer({
  context,
  children,
  ...props
}: PropsWithChildren<DocsContainerProps>) {
  const [theme, setTheme] = useState<Theme>(() => {
    const store = (context as unknown as { store?: GlobalsStore }).store
    return toTheme(store?.userGlobals?.get?.().theme)
  })

  useEffect(() => {
    const onGlobals = ({ globals }: { globals: Record<string, unknown> }) =>
      setTheme(toTheme(globals.theme))
    context.channel.on(GLOBALS_UPDATED, onGlobals)
    return () => context.channel.off(GLOBALS_UPDATED, onGlobals)
  }, [context.channel])

  useEffect(() => applyTheme(theme), [theme])

  return (
    <DocsContainer
      {...props}
      context={context}
      theme={theme === 'dark' ? themes.dark : themes.light}
    >
      {children}
    </DocsContainer>
  )
}
