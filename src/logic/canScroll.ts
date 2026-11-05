type ScrollBox = { scrollTop: number; clientHeight: number; scrollHeight: number }

/** True when a scroll box can still move further down (or up). 1px slack for rounding. */
export function canScroll(box: ScrollBox, down: boolean): boolean {
  return down ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : box.scrollTop > 0
}
