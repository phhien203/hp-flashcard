import { useSyncExternalStore } from 'react'

/** The app's pages, addressed by the URL hash so any static host serves them. */
export type Route = 'all-cards' | 'study'

export const ROUTE_HREFS: Record<Route, string> = {
  'all-cards': '#/',
  study: '#/study',
}

const routeFromHash = (hash: string): Route =>
  hash === ROUTE_HREFS.study ? 'study' : 'all-cards'

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

/** The current page. All Cards is the default for any other URL. */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () =>
    routeFromHash(window.location.hash),
  )
}
