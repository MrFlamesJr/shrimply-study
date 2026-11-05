import { useEffect, useMemo, useState } from 'react'
import { emptyLibrary } from '../../model'
import { fakeQuiz, libraryProblems, libraryStats } from '../../logic/debugData'
import { freeName } from '../../logic/names'
import { plural } from '../../logic/plural'
import { backupSize, storageUse } from '../../storage/browserBackup'
import { fetchLibrary } from '../../storage/fileStorage'
import { checkLibrary, decodeLibrary, libraryToJson } from '../../storage/format'
import type { LibraryApi } from '../../state/useLibrary'
import type { Notify } from '../../components/Toasts'
import edgeCasesUrl from '../../../samples/edge-cases.shrimp?url'
import guideUrl from '../../../samples/how-to-use.shrimp?url'

const MAX_SHOWN = 5

const size = (bytes: number) => {
  const [value, unit] =
    bytes < 1024 ** 2 ? [bytes / 1024, 'KB'] : bytes < 1024 ** 3 ? [bytes / 1024 ** 2, 'MB'] : [bytes / 1024 ** 3, 'GB']
  return `${value.toFixed(1)} ${unit}`
}

export function LibrarySection({ lib, notify }: { lib: LibraryApi; notify: Notify }) {
  // Only when the library changes, not on every toast (App re-renders the page for each one).
  const { stats, jsonBytes, problems } = useMemo(
    () => ({
      stats: libraryStats(lib.library),
      jsonBytes: new TextEncoder().encode(libraryToJson(lib.library)).length,
      problems: libraryProblems(lib.library).length,
    }),
    [lib.library],
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
  }, [lib.library])

  const load = async (url: string, message: string) => {
    if (await lib.open(() => fetchLibrary(url))) notify('info', message)
  }
  const addStress = () => {
    const course = lib.addCourse()
    lib.renameCourse(course.id, freeName('Stress test', lib.library.courses.map((c) => c.name))) // names are unique
    for (const n of [100, 500, 2000]) {
      const quiz = lib.addQuiz(course.id)
      lib.renameQuiz(quiz.id, `${n} cards`)
      const fake = fakeQuiz(n)
      lib.setCards(quiz.id, fake.cards, fake.groups)
    }
    notify('info', 'Added the stress course.')
  }
  const check = () => {
    const problems = libraryProblems(lib.library)
    try {
      checkLibrary(lib.library, 'stored')
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
      <p className="muted">What is in the library now, and ways to replace it.</p>
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
        <dt>Groups</dt>
        <dd>{stats.groups}</dd>
        <dt>Cards in a group</dt>
        <dd>
          {stats.groupedCards} of {stats.termCards + stats.clozeCards}
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
        <dd>{lib.hasChanges ? 'Yes' : 'No'}</dd>
        <dt title="Found by Check library, which lists them">Problems</dt>
        <dd>{problems}</dd>
        <dt>Build</dt>
        <dd>{import.meta.env.MODE}</dd>
      </dl>
      <div className="actions">
        <button
          type="button"
          title="Replace the library with samples/edge-cases.shrimp"
          onClick={() => void load(edgeCasesUrl, 'Loaded the test library.')}
        >
          Load test library
        </button>
        <button
          type="button"
          title="Replace the library with samples/how-to-use.shrimp"
          onClick={() => void load(guideUrl, 'Loaded the guide.')}
        >
          Load guide
        </button>
        <button
          type="button"
          title="Replace the library with an empty one, to see the first visit"
          onClick={() => void lib.open(async () => emptyLibrary())}
        >
          Empty library
        </button>
        <button type="button" title="Adds a course with quizzes of 100, 500 and 2000 cards" onClick={addStress}>
          Add stress course
        </button>
        <button
          type="button"
          title="Shows the error for a file that is not a .shrimp"
          onClick={() => void lib.open(async () => decodeLibrary(new TextEncoder().encode('not a zip')))}
        >
          Open a broken file
        </button>
        <button type="button" title="Check the library for broken ids, groups, order and names" onClick={check}>
          Check library
        </button>
      </div>
    </section>
  )
}
