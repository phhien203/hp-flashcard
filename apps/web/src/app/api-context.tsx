import { createContext, useContext } from 'react'

import type { ApiClient } from '../api/client.js'

const ApiContext = createContext<ApiClient | null>(null)

/** Provides the signed-in account's API client to the queries below it. */
export const ApiProvider = ApiContext.Provider

/** The signed-in account's API client. */
export function useApi() {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside an ApiProvider.')
  return api
}
