// Identifies one generated report: printed in the PDF, in the filename and in the
// e-mail subject, so trondheimdc-regnskap can tell two claims from the same person apart.

// Crockford base32 without I, L, O, U: nothing that reads as another character.
const ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** "UT-20261106-7KQ2": the day the report was made and four random characters. */
export function createReportId(now: Date = new Date()): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const suffix = Array.from(
    bytes,
    (b) => ID_ALPHABET[b % ID_ALPHABET.length],
  ).join("")
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  return `UT-${day}-${suffix}`
}

// Letters NFD does not split into a base letter and a mark.
const TRANSLITERATIONS: Record<string, string> = {
  æ: "ae",
  ø: "o",
  œ: "oe",
  ß: "ss",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
}

/** "Øystein Åsmund Ærlig" -> "oystein-asmund-aerlig". ASCII only, never empty. */
export function filenameSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[æøœßłđðþı]/g, (c) => TRANSLITERATIONS[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "utlegg"
}

/**
 * "UT-20261106-7KQ2-oystein-aerlig-expense-report.pdf". trondheimdc-regnskap finds
 * reports in the Fiken inbox by "expense-report" in the filename, so keep that part.
 */
export function reportFilename(reportId: string, name: string): string {
  return `${reportId}-${filenameSlug(name)}-expense-report.pdf`
}
