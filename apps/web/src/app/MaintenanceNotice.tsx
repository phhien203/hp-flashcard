import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'

import { MAINTENANCE_NOTICE } from '../domain/maintenance.js'
import { Notice } from './Notice.js'
import { isMaintenance } from './queries.js'

/**
 * Whether the last answer to anything this page shows was that the API is
 * closed for maintenance (a database recovery). Clears once a read
 * succeeds again, e.g. on Retry or on coming back to the window.
 */
function useUnderMaintenance() {
  const queryClient = useQueryClient()
  const cache = queryClient.getQueryCache()
  const subscribe = useCallback(
    (onChange: () => void) => cache.subscribe(onChange),
    [cache],
  )
  return useSyncExternalStore(subscribe, () =>
    cache.getAll().some((query) => isMaintenance(query.state.error)),
  )
}

/**
 * Explains, once for the page, why nothing loads during maintenance,
 * without claiming anything about the state of the data.
 */
export function MaintenanceNotice() {
  return useUnderMaintenance() ? (
    <Notice
      role="status"
      title={MAINTENANCE_NOTICE.title}
      description={MAINTENANCE_NOTICE.description}
    />
  ) : null
}
