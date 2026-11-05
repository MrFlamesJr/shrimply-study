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

/** `base`, or "base 2", "base 3" and so on: the first that none of `names` counts as the same name. */
export function freeName(base: string, names: string[]): string {
  let name = base
  for (let i = 2; names.some(sameAs(name)); i++) name = `${base} ${i}`
  return name
}
