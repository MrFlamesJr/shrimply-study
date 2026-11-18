import { useEffect, useMemo, useState } from 'react'
import { emptyLibrary, type Library } from '../../model'
import { fakeQuiz, libraryProblems, libraryStats } from '../../logic/debugData'
import { freeName } from '../../logic/names'
import { plural } from '../../logic/plural'
import { backupSize, readBrokenBackup, storageUse } from '../../storage/browserBackup'
import { fetchLibrary } from '../../storage/fileStorage'
import { checkLibrary, decodeLibrary, libraryToJson } from '../../storage/format'
import type { LibraryApi } from '../../state/useWorkspace'
import type { Notify } from '../../components/Toasts'
import edgeCasesUrl from '../../../samples/edge-cases.shrimp?url'
import guideUrl from '../../../samples/how-to-use.shrimp?url'

const MAX_SHOWN = 5

const size = (bytes: number) => {
  const [value, unit] =
    bytes < 1024 ** 2 ? [bytes / 1024, 'KB'] : bytes < 1024 ** 3 ? [bytes / 1024 ** 2, 'MB'] : [bytes / 1024 ** 3, 'GB']
  return `${value.toFixed(1)} ${unit}`
}

const NO_LIBRARY = emptyLibrary()

type Props = {
  lib: LibraryApi | null
  ensureDoc: () => LibraryApi
  openLibrary: (load: () => Promise<Library>, name: string) => Promise<unknown>
  newDoc: () => void
  notify: Notify
}

export function LibrarySection({ lib, ensureDoc, openLibrary, newDoc, notify }: Props) {
  const library = lib?.library ?? NO_LIBRARY
  // Only when the library changes, not on every toast (App re-renders the page for each one).
  const { stats, jsonBytes, problems } = useMemo(
    () => ({
      stats: libraryStats(library),
      jsonBytes: new TextEncoder().encode(libraryToJson(library)).length,
      problems: libraryProblems(library).length,
    }),
    [library],
  )
  const [backup, setBackup] = useState<number>()
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>()
  // Read after the backup has been written (300ms after the last edit).
  useEffect(() => {
    const timer = setTimeout(() => {
      void backupSize().then(setBackup)
      void storageUse().then(setStorage)
    }, 500)
    return () => clearTimeout(timer)
  }, [library])

  const [broken, setBroken] = useState<string | null>(null)
  useEffect(() => {
    void readBrokenBackup().then(setBroken)
  }, [])
  const downloadBroken = () => {
    if (broken === null) return
    const url = URL.createObjectURL(new Blob([broken], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'unreadable-backup.json'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const load = async (url: string, name: string, message: string) => {
    if (await openLibrary(() => fetchLibrary(url), name)) notify('info', message)
  }
  const addStress = () => {
    const into = ensureDoc()
    const course = into.addCourse()
    into.renameCourse(course.id, freeName('Stress test', into.library.courses.map((c) => c.name))) // names are unique
    for (const n of [100, 500, 2000]) {
      const quiz = into.addQuiz(course.id)
      into.renameQuiz(quiz.id, `${n} cards`)
      const fake = fakeQuiz(n)
      into.setCards(quiz.id, fake.cards, fake.groups)
    }
    notify('info', 'Added the stress course.')
  }
  const check = () => {
    const problems = libraryProblems(library)
    try {
      checkLibrary(library, 'stored')
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err))
    }
    if (problems.length === 0) return notify('info', 'No problems found.')
    problems.slice(0, MAX_SHOWN).forEach((p) => notify('error', p))
    if (problems.length > MAX_SHOWN) notify('warning', `${problems.length - MAX_SHOWN} more problems.`)
  }

  return (
    <section className="debug-section">
      <h2>Library</h2>
      <p className="muted">
        {lib ? `What is in "${lib.name}", the open file, and ways to open others beside it.` : 'No file is open. Ways to open one:'}
      </p>
      {/* Two columns on wide screens, filled row by row: each row pairs two related numbers. */}
      <dl className="debug-stats">
        <dt>Courses</dt>
        <dd>{stats.courses}</dd>
        <dt>Quizzes</dt>
        <dd>{stats.quizzes}</dd>
        <dt>Term cards</dt>
        <dd>{stats.termCards}</dd>
        <dt>Fill in the blank</dt>
        <dd>
          {stats.clozeCards} ({plural(stats.blanks, 'blank')})
        </dd>
        <dt>True or false</dt>
        <dd>{stats.trueFalseCards}</dd>
        <dt>Choice questions</dt>
        <dd>{stats.choiceCards}</dd>
        <dt>Sequences</dt>
        <dd>{stats.sequenceCards}</dd>
        <dt>Groups</dt>
        <dd>{stats.groups}</dd>
        <dt>Cards in a group</dt>
        <dd>
          {stats.groupedCards} of {stats.termCards + stats.clozeCards + stats.trueFalseCards + stats.choiceCards + stats.sequenceCards}
        </dd>
        <dt>Explanations</dt>
        <dd>{stats.explanations}</dd>
        <dt>Incomplete cards</dt>
        <dd>{stats.incomplete}</dd>
        <dt>Empty courses</dt>
        <dd>{stats.emptyCourses}</dd>
        <dt>Empty quizzes</dt>
        <dd>{stats.emptyQuizzes}</dd>
        <dt title="Quizzes without one card that can be asked">Nothing to study</dt>
        <dd>{plural(stats.unstudyable, 'quiz', 'quizzes')}</dd>
        <dt title="Quizzes with only one card that can be asked">Multiple choice off</dt>
        <dd>{plural(stats.noChoice, 'quiz', 'quizzes')}</dd>
        <dt>Largest quiz</dt>
        <dd>{stats.largestQuiz ? `“${stats.largestQuiz.name}”, ${plural(stats.largestQuiz.cards, 'card')}` : 'None'}</dd>
        <dt title="The longest side, statement or explanation">Longest text</dt>
        <dd>{plural(stats.longestText, 'character')}</dd>
        <dt>Images</dt>
        <dd>
          {stats.images} ({size(stats.imageBytes)})
        </dd>
        <dt>Largest image</dt>
        <dd>{stats.images > 0 ? size(stats.largestImage) : 'None'}</dd>
        <dt title="What Download writes as library.json, without the images">library.json</dt>
        <dd>{size(jsonBytes)}</dd>
        <dt>Browser backup</dt>
        <dd>{backup === undefined ? '...' : size(backup)}</dd>
        <dt title="Everything this site keeps in the browser, of what the browser allows">Browser storage</dt>
        <dd>{storage === undefined ? '...' : storage ? `${size(storage.used)} of ${size(storage.quota)}` : 'Unknown'}</dd>
        <dt>Unsaved changes</dt>
        <dd>{lib?.hasChanges ? 'Yes' : 'No'}</dd>
        <dt title="Found by Check library, which lists them">Problems</dt>
        <dd>{problems}</dd>
        <dt>Build</dt>
        <dd>{import.meta.env.MODE}</dd>
      </dl>
      <div className="actions">
        <button
          type="button"
          title="Open samples/edge-cases.shrimp as a file of its own"
          onClick={() => void load(edgeCasesUrl, 'Test library', 'Loaded the test library.')}
        >
          Load test library
        </button>
        <button
          type="button"
          title="Open samples/how-to-use.shrimp as a file of its own"
          onClick={() => void load(guideUrl, 'Guide', 'Loaded the guide.')}
        >
          Load guide
        </button>
        <button
          type="button"
          title="Open an empty library beside the others"
          onClick={newDoc}
        >
          Empty library
        </button>
        <button type="button" title="Adds a course with quizzes of 100, 500 and 2000 cards" onClick={addStress}>
          Add stress course
        </button>
        <button
          type="button"
          title="Shows the error for a file that is not a .shrimp"
          onClick={() => void openLibrary(async () => decodeLibrary(new TextEncoder().encode('not a zip')), 'Broken file')}
        >
          Open a broken file
        </button>
        <button type="button" title="Check the library for broken ids, groups, order and names" onClick={check}>
          Check library
        </button>
        {broken !== null && (
          <button type="button" title="The backup the browser could not read at startup, kept as it was" onClick={downloadBroken}>
            Download unreadable backup
          </button>
        )}
      </div>
    </section>
  )
}
