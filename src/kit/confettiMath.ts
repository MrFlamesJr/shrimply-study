// Confetti particles: pure, no DOM. Angles are radians (0 points right, -PI/2 up), y grows downward,
// time is in seconds, `life` is the seconds a piece has left.
export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  spin: number
  color: string
  w: number
  h: number
  life: number
}

// `count` pieces from a point, fanned around `angle` by `spread` (total width), speeds from half to full `speed`.
// `life` is the longest a piece lasts (seconds, default 1); `random` gives numbers in [0, 1).
export function burst(o: {
  count: number
  x: number
  y: number
  angle: number
  spread: number
  speed: number
  colors: string[]
  random: () => number
  life?: number
}): Particle[] {
  const life = o.life ?? 1
  return Array.from({ length: o.count }, () => {
    const direction = o.angle + (o.random() - 0.5) * o.spread
    const speed = o.speed * (0.5 + o.random() * 0.5)
    return {
      x: o.x,
      y: o.y,
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      angle: o.random() * Math.PI * 2,
      spin: (o.random() - 0.5) * 16,
      color: o.colors[Math.floor(o.random() * o.colors.length)],
      w: 5 + o.random() * 4,
      h: 3 + o.random() * 3,
      life: life * (0.6 + o.random() * 0.4),
    }
  })
}

// Moves every piece by `dt` seconds: gravity pulls down, drag slows (per second), spin turns, life runs out.
// Dead pieces and those below `height` are dropped.
export function stepParticles(ps: Particle[], dt: number, o: { gravity: number; drag: number; height: number }): Particle[] {
  const slow = Math.max(0, 1 - o.drag * dt)
  return ps
    .map((p) => {
      const vx = p.vx * slow
      const vy = p.vy * slow + o.gravity * dt
      return { ...p, x: p.x + vx * dt, y: p.y + vy * dt, vx, vy, angle: p.angle + p.spin * dt, life: p.life - dt }
    })
    .filter((p) => p.life > 0 && p.y <= o.height)
}
