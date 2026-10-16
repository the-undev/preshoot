/** The text whole when it is at most `length` long, or else cut at the last word that fits. */
export function cutAtWord(text: string, length: number): string {
  if (text.length <= length) return text
  const cut = text.slice(0, length)
  // A cut that lands just before a space has ended on a whole word.
  const wordEnd = /\s/.test(text[length]) ? length : cut.search(/\s\S*$/)
  return `${(wordEnd > 0 ? cut.slice(0, wordEnd) : cut).trimEnd()}…`
}
