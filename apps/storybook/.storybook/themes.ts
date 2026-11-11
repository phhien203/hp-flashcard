/** The design-system themes. Shared by the preview and the Vitest projects. */
export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]
