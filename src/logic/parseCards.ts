export type ParsedCard = { term: string; definition: string }

/** Parses pasted text (Quizlet export, spreadsheet rows, or "term - definition" lines) into cards. */
export function parseCards(text: string): ParsedCard[] {
  const lines = text.split(/\r?\n/)
  const separator = lines.some((line) => line.includes('\t')) ? '\t' : ' - '
  const cards: ParsedCard[] = []

  for (const line of lines) {
    if (!line.trim()) continue
    const at = line.indexOf(separator)
    if (at > 0) {
      cards.push({ term: line.slice(0, at).trim(), definition: line.slice(at + separator.length).trim() })
    } else if (cards.length > 0) {
      // Quizlet exports multi-line definitions as extra lines without a separator.
      cards[cards.length - 1].definition += '\n' + line.trim()
    }
  }

  return cards.filter((card) => card.term || card.definition)
}
