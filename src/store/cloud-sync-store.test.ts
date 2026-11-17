import { describe, it, expect, beforeEach } from 'vitest'
import { useCloudSyncStore, type CloudSyncStatus } from './cloud-sync-store'

beforeEach(() => {
  useCloudSyncStore.setState({ status: 'idle' })
})

describe('cloud-sync-store', () => {
  it('starts idle: nothing has been merged on this page load', () => {
    // Read from the store's own initial state, not from the reset above.
    expect(useCloudSyncStore.getInitialState().status).toBe('idle')
  })

  it('moves through the statuses it is given', () => {
    const order: CloudSyncStatus[] = ['syncing', 'done', 'idle']
    for (const status of order) {
      useCloudSyncStore.getState().set(status)
      expect(useCloudSyncStore.getState().status).toBe(status)
    }
  })

  it('tells subscribers when the status changes', () => {
    const seen: CloudSyncStatus[] = []
    const stop = useCloudSyncStore.subscribe(s => seen.push(s.status))
    useCloudSyncStore.getState().set('syncing')
    useCloudSyncStore.getState().set('done')
    stop()
    useCloudSyncStore.getState().set('idle')
    expect(seen).toEqual(['syncing', 'done'])
  })

  it('keeps its setter when the status is replaced', () => {
    useCloudSyncStore.getState().set('done')
    expect(typeof useCloudSyncStore.getState().set).toBe('function')
    useCloudSyncStore.getState().set('idle')
    expect(useCloudSyncStore.getState().status).toBe('idle')
  })
})
