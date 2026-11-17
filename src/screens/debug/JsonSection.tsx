import { useState } from 'react'
import type { Library } from '../../model'
import type { LibraryApi } from '../../state/useWorkspace'
import type { Notify } from '../../components/Toasts'
import { libraryFromJson, libraryToJson } from '../../storage/format'

// `lib`: the active file, whose library Load replaces (one step Ctrl+Z undoes); with none open, Load opens a new one.
type Props = { lib: LibraryApi | null; openLibrary: (load: () => Promise<Library>, name: string) => Promise<unknown>; notify: Notify }

export function JsonSection({ lib, openLibrary, notify }: Props) {
  const [text, setText] = useState('')
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => notify('info', 'Copied.'),
      () => notify('error', 'Could not copy.'),
    )
  const load = async () => {
    let library: Library
    try {
      library = libraryFromJson(text)
    } catch (err) {
      notify('error', `This text could not be loaded.${err instanceof Error ? ` ${err.message}` : ''}`)
      return
    }
    if (lib) lib.replace(library)
    else if (!(await openLibrary(async () => library, 'Library from text'))) return
    notify('info', 'Loaded the library from the text.')
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
        <button type="button" disabled={!lib} onClick={() => lib && setText(libraryToJson(lib.library))}>
          Show current
        </button>
        <button type="button" onClick={() => void copy()}>
          Copy
        </button>
        <button type="button" title="Replace the open file's library with this text (Ctrl+Z undoes it)" onClick={() => void load()}>
          Load
        </button>
      </div>
    </section>
  )
}
