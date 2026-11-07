// An SVG file's parts, to draw it inline (Icons.tsx): the root's attributes as React props (stroke-width >
// strokeWidth; xmlns dropped, as inline SVG needs none) and the markup inside it, without the line breaks between tags.
export function svgParts(file: string): { props: Record<string, string>; inner: string } {
  const svg = file.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/)
  if (!svg) throw new Error('Not an SVG file')
  const props: Record<string, string> = {}
  for (const [, name, , value] of svg[1].matchAll(/([\w:-]+)=(["'])(.*?)\2/g)) {
    if (name === 'xmlns' || name.startsWith('xmlns:')) continue
    props[/^(aria|data)-/.test(name) ? name : name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = value
  }
  return { props, inner: svg[2].replace(/>\s+</g, '><').trim() }
}
