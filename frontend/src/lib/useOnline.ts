import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => { window.removeEventListener('online', onChange); window.removeEventListener('offline', onChange) }
}

/** True while the browser reports a network connection. */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
