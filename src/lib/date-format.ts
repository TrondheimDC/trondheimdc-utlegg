/** Format a Date for Norwegian display (dd.mm.yyyy). */
export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}.${date.getFullYear()}`
}

/**
 * Long localized calendar date for UI (same idea as date-fns "PPP").
 * Uses UTC noon so the calendar day cannot shift across time zones.
 */
export function formatDateLong(date: Date, language: "no" | "en"): string {
  const utcNoon = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0),
  )
  const locale = language === "no" ? "nb-NO" : "en-GB"
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(utcNoon)
}
