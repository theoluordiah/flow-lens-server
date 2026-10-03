// Small models drift back to chatbot formatting even when told not to.
// This strips the habits the writing rules forbid so replies read like a person wrote them.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

export const humanize = (text: string): string =>
  text
    .replace(/\r\n/g, "\n")
    // Markdown headings, bold and italics
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")
    // Bullet and numbered list markers become plain lines
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    // Dashes: spaced or unspaced em dashes read as a comma; en dash ranges become "to"
    .replace(/\s*—\s*/g, ", ")
    .replace(/(\d)\s*–\s*(\d)/g, "$1 to $2")
    .replace(/\s*–\s*/g, ", ")
    // Curly quotes to straight
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(EMOJI, "")
    .replace(/…/g, "...")
    // Tidy what the replacements leave behind
    .replace(/,\s*([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
