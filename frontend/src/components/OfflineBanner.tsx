import { useEffect, useRef, useState } from 'react'
import { useOnline } from '../lib/useOnline'
import { Icon } from './icons'

/** Says plainly when the connection drops, and confirms briefly when it comes back. */
export function OfflineBanner() {
  const online = useOnline()
  const wasOffline = useRef(false)
  const [back, setBack] = useState(false)

  useEffect(() => {
    if (!online) { wasOffline.current = true; setBack(false); return }
    if (!wasOffline.current) return
    wasOffline.current = false
    setBack(true)
    const timer = setTimeout(() => setBack(false), 3000)
    return () => clearTimeout(timer)
  }, [online])

  if (online && !back) return null
  return <div className={`net-banner${online ? ' net-back' : ''}`} role="status">
    <Icon name={online ? 'circleCheck' : 'alert'} size={18} />
    {online ? 'Back online.' : 'You\'re offline. Your answers are kept, and we\'ll reload as soon as you reconnect.'}
  </div>
}
