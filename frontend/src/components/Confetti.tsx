import { useEffect, useRef } from 'react'

const COLORS = ['#004CA6', '#CBE2FF', '#138A3F', '#F08A1C', '#6FA8FF']
const DURATION_MS = 2200

/** One short burst for the best moment in the app. Skipped entirely when the student prefers reduced motion. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    navigator.vibrate?.([15, 40, 25])
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = window.innerWidth, h = window.innerHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    const pieces = Array.from({ length: 140 }, (_, i) => ({
      x: w / 2 + (Math.random() - .5) * w * .3, y: h * .32,
      vx: (Math.random() - .5) * 13, vy: -4 - Math.random() * 13,
      angle: Math.random() * Math.PI, spin: (Math.random() - .5) * .3,
      size: 6 + Math.random() * 6, color: COLORS[i % COLORS.length],
    }))
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const elapsed = now - start
      ctx.clearRect(0, 0, w, h)
      ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS)
      for (const p of pieces) {
        p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.angle += p.spin
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (elapsed < DURATION_MS) frame = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, w, h)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={ref} className="confetti" aria-hidden="true" />
}
