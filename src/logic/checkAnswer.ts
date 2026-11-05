const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** True when the typed input matches the answer, ignoring case, accents, punctuation and extra spaces. */
export function checkAnswer(input: string, answer: string): boolean {
  const expected = normalize(answer)
  // An answer made only of punctuation normalizes to nothing, so compare the raw text.
  if (!expected) return input.trim() !== '' && input.trim() === answer.trim()
  return normalize(input) === expected
}
