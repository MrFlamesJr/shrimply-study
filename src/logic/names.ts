/**
 * A course or quiz name as it appears in the page address: lower case, its letters and digits joined by dashes
 * ("Les vers (2)" > "les-vers-2"). A name with no letters or digits is used as it is. Two names with the same slug
 * count as the same name, so two courses, or two quizzes in one course, can not share one.
 */
export function slug(name: string): string {
  const words = name.normalize().toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)
  return words ? words.join('-') : name.normalize().trim().toLowerCase()
}

const sameAs = (name: string) => (other: string) => slug(other) === slug(name)

/** Why `name` can not be used beside `names` (one of them counts as the same name), or undefined when it can. */
export function nameTaken(name: string, names: string[], what: string): string | undefined {
  const used = names.find(sameAs(name))
  return used === undefined ? undefined : `Another ${what} is already named "${used}"`
}

// Names Windows keeps for devices: no file may be called one, whatever its ending.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/**
 * Why `name` (without its ending) can not be a file name on Windows, macOS or Linux, which a file downloaded from
 * Google Drive must be, or undefined when it can. An empty name is the field's own (required) business.
 */
export function fileNameProblem(name: string): string | undefined {
  if (/[\\/:*?"<>|]/.test(name)) return 'A file name can\'t contain \\ / : * ? " < > |'
  if (/\p{Cc}/u.test(name)) return "A file name can't contain line breaks or tabs"
  if (/[. ]$/.test(name)) return "A file name can't end with a dot or a space"
  if (RESERVED.test(name.trim())) return `"${name.trim()}" is kept for devices on Windows, so it can't be a file name`
  return undefined
}

/** `base`, or "base 2", "base 3" and so on: the first that none of `names` counts as the same name. */
export function freeName(base: string, names: string[]): string {
  let name = base
  for (let i = 2; names.some(sameAs(name)); i++) name = `${base} ${i}`
  return name
}
