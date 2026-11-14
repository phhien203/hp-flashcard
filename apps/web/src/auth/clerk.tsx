import { ClerkProvider, SignIn, useAuth, useClerk } from '@clerk/react'
import type { ComponentProps, ReactNode } from 'react'
import { useMemo } from 'react'

import { tokenForAccount } from './clerk-token.js'
import type { AuthSession } from './session.js'

/**
 * Clerk's prebuilt components in the design system's clothes. The variables
 * point at the semantic color roles, so the `.dark` remapping applies to
 * them too; the elements add the system's radii, shadows and focus ring.
 * Clerk's own layout and form structure stay as they are.
 */
export const clerkAppearance = {
  // Below Tailwind's utilities (see styles.css), so these classes win.
  cssLayerName: 'clerk',
  variables: {
    colorPrimary: 'var(--primary)',
    colorPrimaryForeground: 'var(--primary-foreground)',
    colorBackground: 'var(--card)',
    colorForeground: 'var(--card-foreground)',
    colorMuted: 'var(--muted)',
    colorMutedForeground: 'var(--muted-foreground)',
    colorInput: 'var(--card)',
    colorInputForeground: 'var(--card-foreground)',
    colorNeutral: 'var(--foreground)',
    colorBorder: 'var(--border)',
    colorRing: 'var(--ring)',
    colorDanger: 'var(--destructive)',
    colorShadow: 'var(--shadow-color)',
    fontFamily: 'inherit',
    borderRadius: '8px',
  },
  elements: {
    cardBox: 'rounded-16 border border-border shadow-rest',
    card: 'bg-card',
    headerTitle: 'text-preset-3',
    headerSubtitle: 'text-preset-4-regular text-muted-foreground',
    formFieldLabel: 'text-preset-5-medium',
    formFieldInput:
      'rounded-8 border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring',
    formButtonPrimary:
      'rounded-full border border-border text-preset-4-semibold shadow-rest outline-none hover:shadow-hover focus-visible:border-ring focus-visible:shadow-ring',
    footerActionLink:
      'rounded-4 text-foreground underline outline-none focus-visible:ring-2 focus-visible:ring-ring',
  },
} satisfies ComponentProps<typeof ClerkProvider>['appearance']

/** Signs in with Clerk, then renders the app for that account. */
export function ClerkRoot({
  publishableKey,
  children,
}: {
  publishableKey: string
  children: (session: AuthSession, signIn: ReactNode) => ReactNode
}) {
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearance}>
      <ClerkSession>{children}</ClerkSession>
    </ClerkProvider>
  )
}

function ClerkSession({
  children,
}: {
  children: (session: AuthSession, signIn: ReactNode) => ReactNode
}) {
  const { isLoaded, isSignedIn, userId, signOut } = useAuth()
  const clerk = useClerk()
  const session = useMemo((): AuthSession => {
    if (!isLoaded) return { status: 'loading' }
    if (!isSignedIn || !userId) return { status: 'signed-out' }
    return {
      status: 'signed-in',
      userId,
      getToken: () => tokenForAccount(clerk, userId),
      signOut: () => signOut(),
    }
  }, [isLoaded, isSignedIn, userId, clerk, signOut])

  // Sign-in and sign-up in one flow: registration is open, and a new
  // account starts with an empty Collection. The email one-time code is
  // the instance's configured strategy (see apps/web/README.md).
  return children(session, <SignIn routing="hash" withSignUp />)
}
