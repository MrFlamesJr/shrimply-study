// The edit outline's easter egg (EditOutline): a spin of the dashes `length` px round the editor, as a CSS linear()
// easing. First some anticipation: it eases back `windUp` px like a spring being drawn and holds there for a beat,
// then it snaps forward at once into a fast spin that slows into slow motion just past the end (`overshoot` px), then
// a small bounce back that settles. Both are in px, so they look the same however far it spins. Time: 12.5% wind-up,
// 2.5% hold, 60% spin, 25% bounce.
export function spinCurve(length: number, overshoot = 24, windUp = 24, steps = 80): string {
  const over = length > 0 ? overshoot / length : 0
  const back = length > 0 ? windUp / length : 0
  const at = (t: number) => {
    if (t <= 0.125) return (-back * (1 - Math.cos(Math.PI * (t / 0.125)))) / 2
    if (t <= 0.15) return -back
    if (t <= 0.75) return -back + (1 + over + back) * (1 - (1 - ((t - 0.15) / 0.6) ** 1.05) ** 7)
    const v = (t - 0.75) / 0.25
    return 1 + over * Math.cos(1.5 * Math.PI * v) * (1 - v * v)
  }
  return `linear(${Array.from({ length: steps + 1 }, (_, i) => +at(i / steps).toFixed(5)).join(', ')})`
}
