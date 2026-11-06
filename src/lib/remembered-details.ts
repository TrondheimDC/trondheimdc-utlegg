// "Husk opplysningene mine": the person's own details, kept in this browser's localStorage
// when they tick the box, so the next claim starts filled in. Never the expenses or
// receipts, and never skipBankValidation: that is a choice to make each time.
// Saved only after a report is made, so what's stored has passed the form's checks.

import { z } from "zod"
import type { ExpenseReportFormValues } from "@/lib/expense-schema"

const STORAGE_KEY = "tdc-utlegg:details:v1"

const detailsSchema = z.object({
  residesInNorway: z.boolean(),
  name: z.string(),
  email: z.string(),
  streetAddress: z.string(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
  bankCountry: z.string(),
  bankCountryIso2: z.string(),
  bankIban: z.string(),
  bankRoutingNumber: z.string(),
  bankAccountNumber: z.string(),
  bankAccountType: z.enum(["checking", "savings"]),
  bankSwiftBic: z.string(),
  bankName: z.string(),
  bankAddress: z.string(),
  bankAccountHolderName: z.string(),
  targetCurrency: z.string(),
})

export type RememberedDetails = z.infer<typeof detailsSchema>

const FIELDS = Object.keys(detailsSchema.shape) as (keyof RememberedDetails)[]

/** The stored details, or null when there are none or they no longer fit the form. */
export function readRememberedDetails(): RememberedDetails | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = detailsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Just the fields that are remembered, from a full set of form values. */
export function pickDetails(
  values: Pick<ExpenseReportFormValues, keyof RememberedDetails>,
): Partial<RememberedDetails> {
  return Object.fromEntries(FIELDS.map((field) => [field, values[field]]))
}

export function rememberDetails(values: ExpenseReportFormValues) {
  const parsed = detailsSchema.safeParse(pickDetails(values))
  if (!parsed.success) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.data))
  } catch {
    // Storage full or blocked (private mode): the report is made anyway.
  }
}

export function forgetDetails() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to forget if storage is blocked.
  }
}
