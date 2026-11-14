import { useState } from 'react'

import { App, type AppProps } from '../app/App.js'
import {
  createMockAuth,
  MockSignIn,
  useMockSession,
  type MockAuth,
} from './mock-auth.js'

/**
 * The app on the mock sign-in, for tests and mock development. It starts
 * signed in as `auth`'s account (the demo account by default).
 */
export function MockRoot({
  auth: given,
  createShuffleSeed,
}: {
  auth?: MockAuth
  createShuffleSeed?: AppProps['createShuffleSeed']
}) {
  const [auth] = useState(() => given ?? createMockAuth())
  const session = useMockSession(auth)
  return (
    <App
      session={session}
      signIn={<MockSignIn auth={auth} />}
      createShuffleSeed={createShuffleSeed}
    />
  )
}
