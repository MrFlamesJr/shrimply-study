// Only Latin accents (combining U+0300 to U+036F) are dropped: Japanese dakuten and Indic or Arabic marks change the
// letter. Symbols and # % & @ * are kept, as "C++" and "C#" or "50%" and "50" are different answers.
const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{S}\s#%&@*]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** True when both normalize to the same non-empty text. */
export function sameAnswer(a: string, b: string): boolean {
  const left = normalize(a)
  return left !== '' && left === normalize(b)
}

/** True when the typed input matches the answer, ignoring case, accents, punctuation and extra spaces. */
export function checkAnswer(input: string, answer: string): boolean {
  const expected = normalize(answer)
  // An answer made only of punctuation normalizes to nothing, so compare the raw text.
  if (!expected) return input.trim() !== '' && input.trim() === answer.trim()
  return normalize(input) === expected
}
