# confetti (`src/kit/confettiMath.ts`, `src/kit/Confetti.tsx`)

## Purpose

A one-shot confetti effect. `confettiMath.ts` is the particle physics, pure and testable. `Confetti.tsx` is a React
component that draws it on a full-screen canvas and removes itself when the pieces are gone.

## Public API

`confettiMath.ts`:

- `Particle = { x; y; vx; vy; angle; spin; color: string; w; h; life }`. Angles are radians (0 points right, `-Math.PI / 2`
  up). `y` grows downward. Time is in seconds. `life` is the seconds left.
- `burst(o): Particle[]` with `o = { count; x; y; angle; spread; speed; colors: string[]; random: () => number; life? }`:
  `count` pieces from the point `(x, y)`, fanned around `angle` by `spread` (the total width), at speeds from half to full
  `speed`. `life` is the longest a piece lasts in seconds (default 1); each piece lasts 60% to 100% of it. `random`
  returns numbers in [0, 1).
- `stepParticles(ps, dt, o: { gravity; drag; height }): Particle[]`: moves every piece by `dt` seconds. Gravity pulls
  down (units per second squared), drag slows by `drag` per second, spin turns the piece, life runs out. Pieces whose life
  is spent, or that are below `height`, are removed.

`Confetti.tsx`:

- `Confetti(props: { level: 'done' | 'perfect'; colors: string[] }): ReactNode`. `'done'`: one burst of 40 pieces falling
  from the top centre, about 1.2 seconds. `'perfect'`: four bursts of 35 to 40 pieces shot up from both bottom corners
  (the second pair 0.35 seconds later), about 2.5 seconds.

## Dependencies

`confettiMath.ts`: none. `Confetti.tsx`: `react` and `./confettiMath`. No css file and no `--kit-*` variables: the colors
come in as props.

## Inputs and outputs

`Confetti` takes a level and a list of CSS colors. It renders a `<canvas aria-hidden>` fixed over the whole viewport of
its own document, `pointer-events: none`, `z-index: 50`, or renders nothing. The canvas is sized to the window and the
device pixel ratio when mounted. `burst` and `stepParticles` take and return plain data.

## State ownership

`confettiMath` is pure; the random source is passed in. `Confetti` keeps its own state: the particles, the animation
frame and one flag saying whether the canvas is still shown. The host holds nothing except whether to mount it.

## Events and callbacks

None. `Confetti` has no callback for the end: it just stops rendering. Frames come from the canvas's own window
(`requestAnimationFrame` of `ownerDocument.defaultView`), so it also works in a popup window.

## Integration

```tsx
import { Confetti } from './kit/Confetti'
import { burst, stepParticles } from './kit/confettiMath'

const COLORS = ['#f5c542', '#e5484d', '#3e9bff'] // a stable array (see Limitations)

export function Results({ perfect }: { perfect: boolean }) {
  return <Confetti level={perfect ? 'perfect' : 'done'} colors={COLORS} />
}

// The math on its own (for a different renderer):
let pieces = burst({ count: 30, x: 200, y: 400, angle: -Math.PI / 2, spread: 1, speed: 500, colors: COLORS, random: Math.random })
pieces = stepParticles(pieces, 1 / 60, { gravity: 800, drag: 1.2, height: 800 })
```

Mount `Confetti` when the effect should start (a results screen appears). Unmount it, or change its `key`, to play it
again.

## Limitations and edge cases

- Under `prefers-reduced-motion: reduce` (checked in the canvas's window) the component draws nothing and removes its
  canvas.
- The effect restarts when `level` or `colors` changes identity. Pass a stable `colors` array (a module constant or
  `useMemo`); a new array on every render would restart it on every render.
- Once the animation has ended the component stays mounted but renders nothing. It does not play again unless it is
  remounted.
- The canvas is sized once, when the effect starts. Resizing the window during the animation is not followed.
- `stepParticles` removes a piece when `life <= 0` or `y > height`, so a piece that flies up above the screen
  (negative `y`) stays. `dt` is not clamped in the math; `Confetti` clamps it to 0.05 seconds per frame.
- `stepParticles` with a `dt` large enough that `drag * dt >= 1` stops the piece's speed (the slowing factor is
  floored at 0).
- A piece fades in its last 0.4 seconds (done in `Confetti`, not in the math).
- If the canvas has no 2d context, nothing is drawn and the canvas stays empty.
- `burst` with an empty `colors` array gives pieces whose `color` is `undefined`. Pass at least one color.
- Colors are any CSS color string, passed straight to the canvas as `fillStyle`. A `var(--x)` does not work on a canvas;
  resolve the color before passing it.

In this app: the results screen shows `Confetti` (done, or perfect with the accent) unless motion is reduced (`docs/architecture/decisions.md` 13).
