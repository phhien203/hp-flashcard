// Types for the custom browser commands registered in vite.config.ts.
declare module 'vitest/browser' {
  interface BrowserCommands {
    /** Emulates `prefers-reduced-motion`; `null` restores the browser's own. */
    emulateReducedMotion: (
      reducedMotion: 'reduce' | 'no-preference' | null,
    ) => Promise<void>
  }
}

export {}
