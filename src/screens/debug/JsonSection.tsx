import { useState } from 'react'
import type { LibraryApi } from '../../state/useLibrary'
import type { Notify } from '../../components/Toasts'
import { libraryFromJson, libraryToJson } from '../../storage/format'

export function JsonSection({ lib, notify }: { lib: LibraryApi; notify: Notify }) {
  const [text, setText] = useState('')
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => notify('info', 'Copied.'),
      () => notify('error', 'Could not copy.'),
    )
  const load = async () => {
    if (await lib.open(async () => libraryFromJson(text))) notify('info', 'Loaded the library from the text.')
  }
  return (
    <section className="debug-section">
      <h2>library.json</h2>
      <p className="muted">
        What Download writes as library.json (images are files beside it). Edit it and load it to try the file format;
        errors name the spot.
      </p>
      <textarea
        className="debug-json"
        spellCheck={false}
        aria-label="library.json"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="actions">
        <button type="button" onClick={() => setText(libraryToJson(lib.library))}>
          Show current
        </button>
        <button type="button" onClick={() => void copy()}>
          Copy
        </button>
        <button type="button" title="Replace the library with this text" onClick={() => void load()}>
          Load
        </button>
      </div>
    </section>
  )
}
