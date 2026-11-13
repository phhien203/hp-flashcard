import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AppHeader,
  SegmentedNav,
  ToastProvider,
} from '@hp-flashcard/ui'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useState, type MouseEvent } from 'react'

import { AllCardsPage } from './AllCardsPage.js'
import { ROUTE_HREFS, routeFromHash, useRoute } from './router.js'
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
  const [hasCreateDraft, setHasCreateDraft] = useState(false)
  // The page a link asked for while the create form held input.
  const [leavingTo, setLeavingTo] = useState<string>()

  /** Stops in-app links from silently discarding an unfinished Card. */
  const guardNavigation = (event: MouseEvent) => {
    if (!hasCreateDraft || !(event.target instanceof Element)) return
    const href = event.target.closest('a')?.getAttribute('href')
    if (!href?.startsWith('#') || routeFromHash(href) === route) return
    event.preventDefault()
    setLeavingTo(href)
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="min-h-dvh bg-background text-foreground">
          <div className="mx-auto flex max-w-page flex-col gap-300 px-200 py-200 md:gap-400 md:px-400 md:py-300 xl:px-0">
            <div onClickCapture={guardNavigation}>
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
            </div>
            {route === 'study' ? (
              <main>
                <h1 className="text-preset-2">Study Mode Works</h1>
              </main>
            ) : (
              // Mounted afresh on each visit, so the create form, filters,
              // Shuffle and the loaded count start from their initial values.
              <AllCardsPage
                createShuffleSeed={createShuffleSeed}
                onHasDraftChange={setHasCreateDraft}
              />
            )}
          </div>
        </div>

        <AlertDialog
          open={leavingTo !== undefined}
          onOpenChange={(open) => {
            if (!open) setLeavingTo(undefined)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Leave without creating the card?
              </AlertDialogTitle>
              <AlertDialogDescription>
                What you&rsquo;ve typed into the new card hasn&rsquo;t been
                saved and will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (leavingTo !== undefined) window.location.hash = leavingTo
                }}
              >
                Discard and leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ToastProvider>
    </QueryClientProvider>
  )
}
