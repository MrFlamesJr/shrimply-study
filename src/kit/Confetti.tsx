import { useEffect, useRef, useState, type ReactNode } from 'react'
import { burst, stepParticles, type Particle } from './confettiMath'

type Props = { level: 'done' | 'perfect'; colors: string[] }

// Where the pieces come from at the given window size: [x, y, angle, spread, speed, count, delay seconds].
function plan(level: Props['level'], w: number, h: number) {
  if (level === 'done') return [{ x: w / 2, y: 0, angle: Math.PI / 2, spread: 1.6, speed: 520, count: 40, delay: 0 }]
  const up = -Math.PI / 2
  const speed = Math.max(700, h * 1.15)
  return [
    { x: 0, y: h, angle: up + 0.55, spread: 0.7, speed, count: 40, delay: 0 },
    { x: w, y: h, angle: up - 0.55, spread: 0.7, speed, count: 40, delay: 0 },
    { x: 0, y: h, angle: up + 0.45, spread: 0.8, speed: speed * 0.9, count: 35, delay: 0.35 },
    { x: w, y: h, angle: up - 0.45, spread: 0.8, speed: speed * 0.9, count: 35, delay: 0.35 },
  ]
}

// A canvas over its own document that plays one confetti burst, then removes itself. Nothing under reduced motion.
export function Confetti({ level, colors }: Props): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)
  // The canvas's window is only known once it is mounted, so reduced motion and the end both switch it off here.
  const [on, setOn] = useState(true)
  useEffect(() => {
    const canvas = ref.current
    const view = canvas?.ownerDocument.defaultView
    if (!canvas || !view) return
    if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setOn(false)
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const ratio = view.devicePixelRatio || 1
    const w = view.innerWidth
    const h = view.innerHeight
    canvas.width = w * ratio
    canvas.height = h * ratio
    ctx.scale(ratio, ratio)
    const waves = plan(level, w, h).map((s) => ({ ...s, done: false }))
    const life = level === 'done' ? 1.2 : 2.5
    let ps: Particle[] = []
    let last = 0
    let start = 0
    let frame = 0
    const tick = (now: number) => {
      if (!start) start = last = now
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = (now - start) / 1000
      for (const s of waves) {
        if (!s.done && t >= s.delay) {
          s.done = true
          ps = ps.concat(burst({ ...s, colors, random: Math.random, life }))
        }
      }
      ps = stepParticles(ps, dt, { gravity: level === 'done' ? 600 : 800, drag: level === 'done' ? 1.5 : 1.2, height: h })
      ctx.clearRect(0, 0, w, h)
      for (const p of ps) {
        ctx.globalAlpha = Math.min(1, p.life / 0.4)
        ctx.fillStyle = p.color
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      if (ps.length === 0 && waves.every((s) => s.done)) setOn(false)
      else frame = view.requestAnimationFrame(tick)
    }
    frame = view.requestAnimationFrame(tick)
    return () => view.cancelAnimationFrame(frame)
  }, [level, colors])
  return on && <canvas ref={ref} aria-hidden="true" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }} />
}
