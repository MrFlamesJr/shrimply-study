/** "1 card", "2 cards", "1 quiz", "3 quizzes". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
