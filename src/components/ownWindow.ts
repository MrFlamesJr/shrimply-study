/** The window an element lives in: not the global one, as a popup window shows the main window's React tree. */
export const ownWindow = (el: Node) => (el.ownerDocument ?? (el as Document)).defaultView!
