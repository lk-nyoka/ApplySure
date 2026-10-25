import { useCallback, useEffect, useState } from 'react'

export interface AsyncState<T> { data: T | undefined; error: string | undefined; loading: boolean; reload: () => void }

/** Runs `load` whenever `deps` change; stale responses from earlier runs are ignored. Pass `skip` to wait. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], skip = false): AsyncState<T> {
  const [state, setState] = useState<Omit<AsyncState<T>, 'reload'>>({ data: undefined, error: undefined, loading: !skip })
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt(a => a + 1), [])
  useEffect(() => {
    if (skip) { setState({ data: undefined, error: undefined, loading: false }); return }
    let current = true
    setState(s => ({ ...s, loading: true, error: undefined }))
    load().then(
      data => { if (current) setState({ data, error: undefined, loading: false }) },
      (e: unknown) => { if (current) setState({ data: undefined, error: e instanceof Error ? e.message : 'Something went wrong.', loading: false }) },
    )
    return () => { current = false }
  }, [...deps, skip, attempt])
  // A load that failed (often because the connection dropped) retries by itself once the browser is back online.
  useEffect(() => {
    if (!state.error) return
    window.addEventListener('online', reload)
    return () => window.removeEventListener('online', reload)
  }, [state.error, reload])
  return { ...state, reload }
}
