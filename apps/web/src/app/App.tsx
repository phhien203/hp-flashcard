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
  Button,
  SegmentedNav,
  ToastProvider,
} from '@hp-flashcard/ui'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'

import { createApiClient } from '../api/client.js'
import type { AuthSession } from '../auth/session.js'
import { AllCardsPage } from './AllCardsPage.js'
import { ApiProvider } from './api-context.js'
import {
  createEditKeeper,
  KeptEditProvider,
  type EditKeeper,
} from './kept-edit.js'
import { Notice } from './Notice.js'
import { createQueryClient } from './queries.js'
import { ROUTE_HREFS, routeFromHash, useRoute } from './router.js'
import { randomShuffleSeed } from './shuffle-seed.js'
import { StudyPage } from './StudyPage.js'

export interface AppProps {
  /** Who is signed in, from Clerk or, in tests and mock mode, a stand-in. */
  session: AuthSession
  /** What a signed-out visitor signs in or registers with. */
  signIn: ReactNode
  /** Picks the seed for each Shuffle. Tests pass a fixed sequence. */
  createShuffleSeed?: () => number
}

const PAGE_CLASSES =
  'mx-auto flex max-w-page flex-col gap-300 px-200 py-200 md:gap-400 md:px-400 md:py-300 xl:px-0'

/**
 * The app: a sign-in for visitors, and each signed-in account's private
 * Collection. Every account gets its own query cache and API client, made
 * afresh when the account changes, so nothing cached for one account, and
 * no response to a request made for it, can reach another.
 *
 * The one thing that outlives a session is an unsaved edit, in memory, for
 * when the session ends without signing out: the same account signing in
 * again gets it back, and anyone else makes it forgotten.
 */
export function App({
  session,
  signIn,
  createShuffleSeed = randomShuffleSeed,
}: AppProps) {
  const [keeper] = useState(createEditKeeper)
  return (
    <ToastProvider>
      <div className="min-h-dvh bg-background text-foreground">
        {session.status === 'signed-in' ? (
          <Collection
            key={session.userId}
            userId={session.userId}
            keeper={keeper}
            getToken={session.getToken}
            signOut={() => {
              keeper.clear()
              return session.signOut()
            }}
            createShuffleSeed={createShuffleSeed}
          />
        ) : (
          <div className={PAGE_CLASSES}>
            <AppHeader logoHref={ROUTE_HREFS['all-cards']} nav={null} />
            <main className="flex flex-col items-center gap-300">
              {session.status === 'loading' ? (
                <Notice role="status" title="Loading…" />
              ) : (
                <>
                  <div className="flex flex-col gap-100 text-center">
                    <h1 className="text-preset-2">
                      Sign in to your flashcards
                    </h1>
                    <p className="text-preset-4-regular text-muted-foreground">
                      Your cards are private to your account and follow you to
                      every device.
                    </p>
                  </div>
                  {signIn}
                </>
              )}
            </main>
          </div>
        )}
      </div>
    </ToastProvider>
  )
}

interface CollectionProps {
  userId: string
  keeper: EditKeeper
  getToken: () => Promise<string | null>
  signOut: () => void | Promise<void>
  createShuffleSeed: () => number
}

/** One signed-in account's Collection, with its own cache and API client. */
function Collection({
  userId,
  keeper,
  getToken,
  signOut,
  createShuffleSeed,
}: CollectionProps) {
  // Mounted once per account (App keys it by user id), so these are too.
  const [queryClient] = useState(createQueryClient)
  const api = useMemo(() => createApiClient({ getToken }), [getToken])
  // Signing out or switching account: stop this account's requests and
  // forget everything cached for it.
  useEffect(
    () => () => {
      void queryClient.cancelQueries()
      queryClient.clear()
    },
    [queryClient],
  )

  // Mounted once per account, so an edit kept for another is forgotten here.
  const [restored] = useState(() => keeper.resume(userId))
  const keptEdit = useMemo(
    () => ({
      restored,
      keep: (edit: Parameters<EditKeeper['keep']>[1]) =>
        keeper.keep(userId, edit),
    }),
    [restored, keeper, userId],
  )

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
    <ApiProvider value={api}>
      <KeptEditProvider value={keptEdit}>
        <QueryClientProvider client={queryClient}>
          <div className={PAGE_CLASSES}>
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
              // Mounted afresh on each visit, so the filters, Shuffle and
              // position start from their initial values.
              <StudyPage createShuffleSeed={createShuffleSeed} />
            ) : (
              // Mounted afresh on each visit, so the create form, filters,
              // Shuffle and the loaded count start from their initial values.
              <AllCardsPage
                createShuffleSeed={createShuffleSeed}
                onHasDraftChange={setHasCreateDraft}
              />
            )}
            <footer className="flex justify-center">
              <Button variant="outline" onClick={() => void signOut()}>
                Sign out
              </Button>
            </footer>
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
                    if (leavingTo !== undefined)
                      window.location.hash = leavingTo
                  }}
                >
                  Discard and leave
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </QueryClientProvider>
      </KeptEditProvider>
    </ApiProvider>
  )
}
