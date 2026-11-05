/**
 * The backdrop's moving layer is painted by the page, the top row and the phone corner (base.css), which appear at
 * different times (the top row and the corner leave during a study session). Every slide runs on one clock, the
 * page's (start time 0), so their copies always line up. Only a copy that is off that clock is touched, so a slide
 * that is already running never hitches.
 */
export function syncDrift() {
  for (const a of document.getAnimations()) {
    if (a instanceof CSSAnimation && a.animationName === 'drift' && a.startTime !== 0) a.startTime = 0
  }
}
