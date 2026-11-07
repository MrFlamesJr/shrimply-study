import { useEffect, useRef, useState } from 'react'
import { spinCurve } from '../../logic/spinCurve'

// The dash pattern before it is stretched to fit the outline evenly (px): DASH_SETS of long dash, gap, short dash,
// gap, then one more long dash, so the word always sits between two long dashes, with a wider gap on each side of it
// so it reads.
const LONG = 36
const SHORT = 8
const GAP = 10
const WORD_GAP = 16
const DASH_SETS = 3
const SET = LONG + GAP + SHORT + GAP

// Edit mode's outline (editor.css): a rounded rectangle of long and short dashes around the whole editor where every
// few dashes one is the word "Editing", following the line round the corners. The pattern repeats a whole number of
// times, so it runs on round the corner where the path starts and ends. The dashes move by a CSS transition on hover;
// the words copy the dash offset each frame while it moves, so they move with them. Drawn as a path, as text can
// only follow a path, rebuilt when the editor's size, the theme's corner radius or the word's font changes.
// Easter egg (asked for): a click on the line itself spins the dashes and words a short way round (two repeats of
// the pattern, spinCurve), as an animation added on top of the hover's offset, so they end looking just as they
// started; not under reduced motion.
export function EditOutline() {
  const ref = useRef<SVGSVGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const measureRef = useRef<SVGTextElement>(null)
  const followRef = useRef(() => {})
  const [box, setBox] = useState({ w: 0, h: 0, r: 0, word: 0 })
  const [shift, setShift] = useState(0)

  useEffect(() => {
    const svg = ref.current!
    const path = pathRef.current!
    const measure = () => {
      const { width: w, height: h } = svg.getBoundingClientRect()
      const r = Math.min(parseFloat(getComputedStyle(svg).getPropertyValue('--radius')) || 0, w / 2, h / 2)
      // Letter spacing also follows the last letter; leave it out, so the gaps on both sides of the word match.
      const text = measureRef.current!
      const word = text.getComputedTextLength() - (parseFloat(getComputedStyle(text).letterSpacing) || 0)
      setBox((b) => (b.w === w && b.h === h && b.r === r && b.word === word ? b : { w, h, r, word }))
    }
    let frame = 0
    let started = 0
    const follow = (now: number) => {
      setShift(-parseFloat(getComputedStyle(path).strokeDashoffset) || 0)
      // Keep going while the dashes move (and a moment longer, in case the transition hasn't started yet).
      frame = path.getAnimations().length > 0 || now - started < 100 ? requestAnimationFrame(follow) : 0
    }
    const move = () => {
      cancelAnimationFrame(frame)
      started = performance.now()
      frame = requestAnimationFrame(follow)
    }
    followRef.current = move
    measure()
    move()
    const resize = new ResizeObserver(measure)
    resize.observe(svg)
    const theme = new MutationObserver(measure)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    document.fonts.addEventListener('loadingdone', measure)
    const host = svg.parentElement!
    host.addEventListener('pointerenter', move)
    host.addEventListener('pointerleave', move)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      theme.disconnect()
      document.fonts.removeEventListener('loadingdone', measure)
      host.removeEventListener('pointerenter', move)
      host.removeEventListener('pointerleave', move)
    }
  }, [])

  const { w, h, r, word } = box
  const arc = `A${r},${r} 0 0 1`
  const d = `M${r},0 H${w - r} ${arc} ${w},${r} V${h - r} ${arc} ${w - r},${h} H${r} ${arc} 0,${h - r} V${r} ${arc} ${r},0 Z`
  const length = 2 * (w + h) - 8 * r + 2 * Math.PI * r
  const unstretched = DASH_SETS * SET + LONG + 2 * WORD_GAP
  const count = Math.max(1, Math.round(length / (unstretched + word)))
  const period = length / count
  const k = Math.max(0.5, (period - word) / unstretched)
  const dashes = [...Array.from({ length: DASH_SETS }, () => [LONG, GAP, SHORT, GAP]).flat(), LONG, 2 * WORD_GAP]
    .map((n) => n * k)
  dashes[dashes.length - 1] += word
  const wordAt = (DASH_SETS * SET + LONG + WORD_GAP) * k

  // Each word twice, a whole loop apart: a word across the path's start shows its letters from both.
  const words =
    word > 0 && w > 0
      ? Array.from({ length: count }, (_, i) => {
          const at = (((i * period + wordAt + shift) % length) + length) % length
          return [at, at - length].map((offset, j) => (
            <text key={`${i}-${j}`} dominantBaseline="central">
              <textPath href="#edit-outline-path" startOffset={offset}>
                Editing
              </textPath>
            </text>
          ))
        })
      : null

  const spin = () => {
    const path = pathRef.current!
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || path.getAnimations().some((a) => a.id === 'spin')) return
    // The build may write the token in seconds ("1.8s") or ms.
    const token = getComputedStyle(path).getPropertyValue('--dur-edit-spin').trim()
    const duration = parseFloat(token) * (token.endsWith('ms') ? 1 : 1000)
    // Two whole repeats of the pattern: a short spin that ends looking just as it started.
    const distance = 2 * period
    path.animate([{ strokeDashoffset: '0px' }, { strokeDashoffset: `${-distance}px` }], {
      id: 'spin',
      duration,
      easing: spinCurve(distance),
      composite: 'add',
    })
    followRef.current()
  }

  return (
    <svg ref={ref} className="edit-outline" aria-hidden="true">
      <text ref={measureRef} className="edit-outline-measure">
        Editing
      </text>
      <path ref={pathRef} id="edit-outline-path" className="edit-outline-line" d={d} strokeDasharray={dashes.join(' ')} />
      {words}
      <path className="edit-outline-hit" d={d} onClick={spin} />
    </svg>
  )
}
