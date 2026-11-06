/**
 * What a receipt was for, in everyday words. The person picks one per receipt;
 * trondheimdc-regnskap books it on that category's account, and can move it in its review
 * (e.g. materiell to utstyr or profilering, servering to crew).
 *
 * `id` is the category id in trondheimdc-regnskap (regnskap.config.json, utlegg), so each
 * choice here is exactly one category there. `pdfLabel` is part of the PDF contract
 * (docs/pdf-format.md): printed verbatim in the Kategori column, one label per id.
 * Neither may change without telling regnskap.
 */
export const EXPENSE_CATEGORIES = [
  { id: "reise", pdfLabel: "Reise" },
  { id: "overnatting", pdfLabel: "Overnatting" },
  { id: "servering", pdfLabel: "Servering" },
  { id: "materiell", pdfLabel: "Materiell" },
  { id: "programvare", pdfLabel: "Programvare" },
  { id: "meetup-stotte", pdfLabel: "Meetup-støtte" },
  { id: "annet", pdfLabel: "Annet" },
] as const

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORIES)[number]["id"]

export const EXPENSE_CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id) as [
  ExpenseCategoryId,
  ...ExpenseCategoryId[],
]

export const MEETUP_SUPPORT: ExpenseCategoryId = "meetup-stotte"

/** A category id from a link (`?category=meetup-stotte`), or null if it isn't one. */
export function parseCategory(
  value: string | undefined,
): ExpenseCategoryId | null {
  const v = value?.trim().toLowerCase()
  return EXPENSE_CATEGORY_IDS.find((id) => id === v) ?? null
}

/**
 * Who the link is for (`?for=speaker`): the form then only offers what makes sense for them.
 * It only hides choices; regnskap checks every category anyway.
 */
export const PURPOSES = ["speaker", "meetup", "forening"] as const
export type Purpose = (typeof PURPOSES)[number]

export function parsePurpose(value: string | undefined): Purpose | null {
  const v = value?.trim().toLowerCase()
  return PURPOSES.find((p) => p === v) ?? null
}

/** A heading in the category list (a key under expense.categoryGroups), or none. */
export interface CategoryGroup {
  heading?: "speaker" | "association" | "meetup"
  ids: ExpenseCategoryId[]
}

const SPEAKER: ExpenseCategoryId[] = ["reise", "overnatting"]
const ASSOCIATION: ExpenseCategoryId[] = [
  "servering",
  "materiell",
  "programvare",
]

/**
 * The category list for a link. Without `for`, everything under headings: the speaker's
 * first, "Annet" last on its own. With `for`, only that purpose's choices.
 */
export function categoryGroups(purpose: Purpose | null): CategoryGroup[] {
  switch (purpose) {
    case "speaker":
      return [{ ids: [...SPEAKER, "annet"] }]
    case "meetup":
      return [{ ids: [MEETUP_SUPPORT] }]
    case "forening":
      return [{ ids: [...ASSOCIATION, ...SPEAKER, "annet"] }]
    default:
      return [
        { heading: "speaker", ids: SPEAKER },
        { heading: "association", ids: ASSOCIATION },
        { heading: "meetup", ids: [MEETUP_SUPPORT] },
        { ids: ["annet"] },
      ]
  }
}

/**
 * The category the link settles, so the form doesn't ask: `?category=<id>`, or the only
 * choice `?for` leaves (`?for=meetup`). The PDF still prints it on every receipt.
 */
export function lockedCategory(
  purpose: Purpose | null,
  category: ExpenseCategoryId | null,
): ExpenseCategoryId | null {
  if (category) return category
  const ids = categoryGroups(purpose).flatMap((g) => g.ids)
  return ids.length === 1 ? (ids[0] ?? null) : null
}

export function categoryPdfLabel(id: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.id === id)?.pdfLabel ?? "Annet"
}
