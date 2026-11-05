export type ParsedCard = { term: string; definition: string }

/** Parses pasted text (Quizlet export, spreadsheet rows, or "term - definition" lines) into cards. */
export function parseCards(text: string): ParsedCard[] {
  const lines = text.split(/\r?\n/)
  const separator = lines.some((line) => line.includes('\t')) ? '\t' : ' - '
  const cards: ParsedCard[] = []

  for (const line of lines) {
    if (!line.trim()) continue
    const at = line.indexOf(separator)
    // In tab mode a line starting with a tab is a card with an empty term.
    if (at > 0 || (at === 0 && separator === '\t')) {
      cards.push({ term: line.slice(0, at).trim(), definition: line.slice(at + separator.length).trim() })
    } else if (cards.length > 0) {
      // Quizlet exports multi-line definitions as extra lines without a separator.
      cards[cards.length - 1].definition += '\n' + line.trim()
    } else {
      cards.push({ term: line.trim(), definition: '' })
    }
  }

  return cards.filter((card) => card.term || card.definition)
}
