import { AppHeader, SegmentedNav } from '@hp-flashcard/ui'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'

import { AllCardsPage } from './AllCardsPage.js'
import { ROUTE_HREFS, useRoute } from './router.js'
import { randomShuffleSeed } from './shuffle-seed.js'

export interface AppProps {
  queryClient: QueryClient
  /** Picks the seed for each Shuffle. Tests pass a fixed sequence. */
  createShuffleSeed?: () => number
}

export function App({
  queryClient,
  createShuffleSeed = randomShuffleSeed,
}: AppProps) {
  const route = useRoute()

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto flex max-w-page flex-col gap-300 px-200 py-200 md:gap-400 md:px-400 md:py-300 xl:px-0">
          <AppHeader
            logoHref={ROUTE_HREFS['all-cards']}
            nav={
              <SegmentedNav
                aria-label="Pages"
                items={[
                  {
                    label: 'Study Mode',
                    href: ROUTE_HREFS.study,
                    current: route === 'study',
                  },
                  {
                    label: 'All Cards',
                    href: ROUTE_HREFS['all-cards'],
                    current: route === 'all-cards',
                  },
                ]}
              />
            }
          />
          {route === 'study' ? (
            <main>
              <h1 className="text-preset-2">Study Mode Works</h1>
            </main>
          ) : (
            // Mounted afresh on each visit, so filters, Shuffle and the
            // loaded count start from their initial values.
            <AllCardsPage createShuffleSeed={createShuffleSeed} />
          )}
        </div>
      </div>
    </QueryClientProvider>
  )
}
