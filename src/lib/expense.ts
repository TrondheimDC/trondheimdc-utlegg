import {
  composeIBAN,
  countrySpecs,
  electronicFormatIBAN,
  isValidBIC,
  isValidIBAN,
} from "ibantools"
import { z } from "zod"

/**
 * Classify bank country for form flow: SEPA (IBAN), US (ABA + SWIFT etc.), or Other.
 * Uses ibantools country specs to determine IBAN support.
 */
export function getBankCountryType(iso2: string): "sepa" | "us" | "other" {
  if (iso2 === "US") return "us"
  const spec = countrySpecs[iso2.toUpperCase()]
  if (spec?.IBANRegistry) return "sepa"
  return "other"
}

/** Length of the BBAN part (IBAN without country code and check digits) for a country. */
export function getIBANBbanLength(iso2: string): number | null {
  const spec = countrySpecs[iso2.toUpperCase()]
  return spec?.chars != null ? spec.chars - 4 : null
}

/**
 * Build full IBAN from country code and BBAN.
 * Computes check digits per ISO 13616 via ibantools.
 * For partial BBANs (during typing), uses placeholder check digits
 * so the value remains extractable; real check digits are computed on blur.
 */
export function buildIBAN(countryCode: string, bban: string): string {
  const cc = countryCode.toUpperCase().replace(/\s/g, "")
  const cleanBban = bban.replace(/\s/g, "")
  if (cc.length !== 2 || !/^[A-Z]{2}$/.test(cc) || !cleanBban) return ""
  return (
    composeIBAN({ countryCode: cc, bban: cleanBban }) ?? `${cc}00${cleanBban}`
  )
}

/** IBAN display format: groups of 4 characters, uppercase (same as IbanAccountInput). */
export function formatIBANForDisplay(iban: string): string {
  return (iban || "")
    .replace(/\s+/g, "")
    .replace(/([a-z0-9]{4})/gi, "$1 ")
    .trim()
    .toUpperCase()
}

/** Norwegian BBAN display format: XXXX XX XXXXX (4 + 2 + 5 digits, same as NorwegianAccountInput). */
export function formatNorwegianBBANForDisplay(bban: string): string {
  const digits = (bban || "").replace(/\D/g, "")
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)} ${digits.slice(4)}`
  return `${digits.slice(0, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`
}

export const createExpenseSchemas = () => {
  const expenseItemSchema = z.object({
    description: z
      .string({
        required_error: "errors.descriptionRequired",
        invalid_type_error: "errors.descriptionRequired",
      })
      .min(2, "errors.descriptionRequired"),
    amount: z
      .number({
        required_error: "errors.amountPositive",
        invalid_type_error: "errors.amountPositive",
      })
      .min(0.01, "errors.amountPositive"),
    currency: z
      .string({
        required_error: "errors.currencyRequired",
        invalid_type_error: "errors.currencyRequired",
      })
      .min(1, "errors.currencyRequired")
      .default("NOK"),
    date: z
      .date({
        required_error: "errors.dateRequired",
        invalid_type_error: "errors.dateRequired",
      })
      .min(new Date("2020-01-01"), "errors.dateRequired"),
    attachment: z
      .custom<File>((file) => file instanceof File, "errors.fileRequired")
      .refine((file) => file.size > 0, "errors.fileRequired")
      .default(new File([], "")),
  })

  const formSchema = z
    .object({
      name: z
        .string({
          required_error: "errors.nameRequired",
          invalid_type_error: "errors.nameRequired",
        })
        .min(1, "errors.nameRequired"),
      streetAddress: z
        .string({
          required_error: "errors.streetRequired",
          invalid_type_error: "errors.streetRequired",
        })
        .min(1, "errors.streetRequired"),
      postalCode: z
        .string({
          required_error: "errors.postalRequired",
          invalid_type_error: "errors.postalRequired",
        })
        .min(1, "errors.postalRequired"),
      city: z
        .string({
          required_error: "errors.cityRequired",
          invalid_type_error: "errors.cityRequired",
        })
        .min(1, "errors.cityRequired"),
      country: z
        .string({
          required_error: "errors.countryRequired",
          invalid_type_error: "errors.countryRequired",
        })
        // Allow empty by default; we enforce "required" only when not residing
        // in Norway in the superRefine block below.
        .optional()
        .default(""),
      residesInNorway: z.boolean().default(true),
      bankCountry: z.string().optional().default(""),
      bankCountryIso2: z.string().optional().default(""),
      bankIban: z.string().optional().default(""),
      bankRoutingNumber: z.string().optional().default(""),
      bankAccountNumber: z.string().optional().default(""),
      bankAccountType: z
        .enum(["checking", "savings"])
        .optional()
        .default("checking"),
      bankSwiftBic: z.string().optional().default(""),
      bankName: z.string().optional().default(""),
      bankAddress: z.string().optional().default(""),
      bankAccountHolderName: z.string().optional().default(""),
      skipBankValidation: z.boolean().optional().default(false),
      email: z
        .string({
          required_error: "errors.invalidEmail",
          invalid_type_error: "errors.invalidEmail",
        })
        .email("errors.invalidEmail"),
      expenses: z
        .array(expenseItemSchema, {
          required_error: "errors.expenseRequired",
          invalid_type_error: "errors.expenseRequired",
        })
        .min(1, "errors.expenseRequired"),
    })
    .superRefine((data, ctx) => {
      const skip = data.skipBankValidation === true

      // Country is required only when the user does NOT reside in Norway.
      if (!data.residesInNorway) {
        const country = (data.country || "").trim()
        if (!country) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.countryRequired",
            path: ["country"],
          })
        }
      }

      if (data.residesInNorway) {
        const accountNumber = (data.bankAccountNumber || "").replace(/\s/g, "")
        if (!accountNumber) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.bankAccountNumberRequired",
            path: ["bankAccountNumber"],
          })
          return
        }
        if (!skip && !validateNorwegianBBAN(accountNumber)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.invalidNorwegianAccount",
            path: ["bankAccountNumber"],
          })
        }
        return
      }

      if (!data.bankCountryIso2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "errors.bankCountryRequired",
          path: ["bankCountry"],
        })
        return
      }

      const type = getBankCountryType(data.bankCountryIso2)
      if (type === "sepa") {
        const iban = (data.bankIban || "").replace(/\s/g, "")
        if (!iban) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.bankIbanRequired",
            path: ["bankIban"],
          })
        }
        const swiftBic = (data.bankSwiftBic || "").trim()
        if (!swiftBic) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.bankSwiftRequired",
            path: ["bankSwiftBic"],
          })
        } else if (!skip && !validateBIC(swiftBic)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.invalidSwift",
            path: ["bankSwiftBic"],
          })
        }
        if (!skip && iban && !validateIBAN(iban.toUpperCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.invalidAccount",
            path: ["bankIban"],
          })
        }
        return
      }
      if (type === "us") {
        // Skip all bank validation for US when skipBankValidation is enabled
        if (skip) return

        const routing = (data.bankRoutingNumber || "").trim()
        if (!routing) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.bankRoutingRequired",
            path: ["bankRoutingNumber"],
          })
        } else if (!validateABARoutingNumber(routing)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.invalidRoutingNumber",
            path: ["bankRoutingNumber"],
          })
        }
        const accountNum = (data.bankAccountNumber || "").trim()
        if (!accountNum) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.bankAccountNumberRequired",
            path: ["bankAccountNumber"],
          })
        } else {
          const digitsOnly = accountNum.replace(/\D/g, "")
          if (digitsOnly.length < 4 || digitsOnly.length > 17) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "errors.invalidUsAccountNumber",
              path: ["bankAccountNumber"],
            })
          }
        }
        const usSwift = (data.bankSwiftBic || "").trim()
        if (!usSwift) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.bankSwiftRequired",
            path: ["bankSwiftBic"],
          })
        } else if (!validateBIC(usSwift)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.invalidSwift",
            path: ["bankSwiftBic"],
          })
        }
        if (!(data.bankName || "").trim())
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.bankNameRequired",
            path: ["bankName"],
          })
        if (!(data.bankAddress || "").trim())
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.bankAddressRequired",
            path: ["bankAddress"],
          })
        if (!(data.bankAccountHolderName || "").trim())
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "errors.bankHolderRequired",
            path: ["bankAccountHolderName"],
          })
        return
      }
      // type === "other"
      if (!(data.bankAccountNumber || "").trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "errors.bankAccountNumberRequired",
          path: ["bankAccountNumber"],
        })
      if (!(data.bankSwiftBic || "").trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "errors.bankSwiftRequired",
          path: ["bankSwiftBic"],
        })
      if (!(data.bankName || "").trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "errors.bankNameRequired",
          path: ["bankName"],
        })
      if (!(data.bankAddress || "").trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "errors.bankAddressRequired",
          path: ["bankAddress"],
        })
      if (!(data.bankAccountHolderName || "").trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "errors.bankHolderRequired",
          path: ["bankAccountHolderName"],
        })
    })

  return { expenseItemSchema, formSchema }
}

export type ExpenseReportFormValues = z.infer<
  ReturnType<typeof createExpenseSchemas>["formSchema"]
>

/**
 * Validates a bank account number, supporting both Norwegian BBAN and international IBAN formats.
 * Automatically detects the format based on the input.
 */
export const validateBankAccount = (accountNumber: string): boolean => {
  const cleanAccountNumber = accountNumber
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()

  if (/^[A-Z]{2}/.test(cleanAccountNumber)) {
    return validateIBAN(cleanAccountNumber)
  }

  return validateNorwegianBBAN(cleanAccountNumber)
}

/**
 * Validates a Norwegian bank account number (BBAN).
 * Uses modulo-11 check digit validation.
 */
export const validateNorwegianBBAN = (accountNumber: string): boolean => {
  if (accountNumber.length !== 11) return false

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

  const sum = accountNumber
    .slice(0, 10)
    .split("")
    .map((c) => parseInt(c, 10))
    .reduce((acc, digit, index) => {
      const weight = weights[index] ?? 0
      return acc + digit * weight
    }, 0)

  const checkDigit = (11 - (sum % 11)) % 11
  return checkDigit === parseInt(accountNumber.charAt(10), 10)
}

/** Validates an IBAN (format, length, check digits) via ibantools. */
export const validateIBAN = (iban: string): boolean => {
  const electronic = electronicFormatIBAN(iban)
  if (!electronic) return false
  return isValidIBAN(electronic)
}

/** Validates a SWIFT/BIC code (8 or 11 characters) via ibantools. */
export const validateBIC = (bic: string): boolean => {
  return isValidBIC(bic.replace(/\s/g, "").toUpperCase())
}

/**
 * Validates a US ABA routing number (9 digits, checksum with 3-7-1 weights).
 * See https://en.wikipedia.org/wiki/ABA_routing_transit_number#Check_digit
 */
export const validateABARoutingNumber = (routing: string): boolean => {
  const digits = routing.replace(/\D/g, "")
  if (digits.length !== 9) return false

  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1]
  const sum = digits.split("").reduce((acc, d, i) => {
    const weight = weights[i] ?? 0
    return acc + parseInt(d, 10) * weight
  }, 0)

  return sum % 10 === 0
}

export const validateAccountNumber = validateBankAccount

// ---------------------------------------------------------------------------
// Exchange rate helpers
// ---------------------------------------------------------------------------

/**
 * Converts an amount using Norges Bank rate fields (raw rate and UNIT_MULT).
 */
export function nokAmountFromExchangeRateData(
  amount: number,
  data: { rate: number; unitMultiplier: number },
): number {
  const normalizedRate = data.rate / data.unitMultiplier
  return Math.round(amount * normalizedRate * 100) / 100
}

/**
 * Fetches exchange rate data from Norges Bank API (currency + date only; no amount).
 * @param currency The currency code
 * @param date The date to get the exchange rate for
 * @returns Object with rate, unitMultiplier, and the actual date of the rate, or null if not found
 */
export async function fetchExchangeRateData(
  currency: string,
  date: Date,
): Promise<{
  rate: number
  unitMultiplier: number
  rateDate: Date
} | null> {
  if (currency === "NOK") {
    return { rate: 1, unitMultiplier: 1, rateDate: date }
  }

  try {
    const dateStr = toISODateString(date)
    // Request 7 days back to ensure we get business days
    // Covers weekends (2 days) and most holidays (long weekends up to 4 days)
    const startDate = new Date(date)
    startDate.setDate(startDate.getDate() - 7)
    const startDateStr = toISODateString(startDate)

    const url = `https://data.norges-bank.no/api/data/EXR/B.${currency}.NOK.SP?format=sdmx-json&startPeriod=${startDateStr}&endPeriod=${dateStr}&locale=no`

    const response = await fetch(url)
    if (!response.ok) {
      console.error(`Failed to fetch exchange rate: ${response.statusText}`)
      return null
    }

    const responseData = await response.json()

    try {
      // Extract UNIT_MULT from the API response attributes
      let unitMultiplier = 1
      try {
        const attributes = responseData.data?.structure?.attributes?.series
        if (attributes && Array.isArray(attributes)) {
          const unitMultAttr = attributes.find(
            (attr: { id: string }) => attr.id === "UNIT_MULT",
          )
          if (unitMultAttr?.values?.[0]?.id) {
            const unitMultValue = parseInt(unitMultAttr.values[0].id, 10)
            if (!Number.isNaN(unitMultValue)) {
              unitMultiplier = 10 ** unitMultValue
            }
          }
        }
      } catch (_e) {
        // Could not parse UNIT_MULT from API response; fall back to default 1
      }

      // Get the dimension values (dates) from the API
      const dimensions = responseData.data?.structure?.dimensions
      const observationDimensions = dimensions?.observation

      let dimensionValues: Array<{ id: string }> = []
      if (observationDimensions && Array.isArray(observationDimensions)) {
        const timeDimension = observationDimensions.find(
          (d: { id?: string }) => d.id === "TIME_PERIOD",
        )
        if (timeDimension?.values && Array.isArray(timeDimension.values)) {
          dimensionValues = timeDimension.values
        }
      }

      const observations =
        responseData.data.dataSets[0].series["0:0:0:0"].observations

      const observationKeys = Object.keys(observations).sort(
        (a, b) => parseInt(a, 10) - parseInt(b, 10),
      )

      if (observationKeys.length === 0) {
        return null
      }

      const lastKey = observationKeys[observationKeys.length - 1]
      if (!lastKey) {
        return null
      }

      // Get the actual date from the dimension values
      const lastKeyNum = parseInt(lastKey, 10)
      let rateDate: Date

      if (dimensionValues.length > lastKeyNum) {
        const dimValue = dimensionValues[lastKeyNum]
        const rateDateStr =
          typeof dimValue === "string"
            ? dimValue
            : (dimValue?.id as string | undefined)
        if (rateDateStr) {
          rateDate = parseISODateString(rateDateStr.substring(0, 10))
        } else {
          rateDate = date
        }
      } else {
        rateDate = date
      }

      const rateStr = observations[lastKey][0]
      const rate = Number(rateStr)

      if (Number.isNaN(rate) || !Number.isFinite(rate)) {
        return null
      }

      return { rate, unitMultiplier, rateDate }
    } catch (_e) {
      // Could not extract rate from dataset
    }

    return null
  } catch (error) {
    console.error("Error fetching exchange rate:", error)
    return null
  }
}

/** Rate row from {@link fetchExchangeRateData} (no amount yet). */
export type ExchangeRateDatum = {
  rate: number
  unitMultiplier: number
  rateDate: Date
}

/** Values shown under the amount field (rate line + NOK repayment). */
export type ExchangeRateDisplayRow = {
  rate: number
  date: Date
  nokAmount: number
  unitMultiplier: number
}

export function exchangeRateDisplayInfo(
  currency: string | undefined,
  expenseDate: Date | undefined,
  amount: number,
  rateDatum: ExchangeRateDatum | null | undefined,
): ExchangeRateDisplayRow | null {
  if (!currency || currency === "NOK" || !expenseDate || amount <= 0)
    return null
  if (!rateDatum) return null
  return {
    rate: rateDatum.rate,
    date: rateDatum.rateDate,
    unitMultiplier: rateDatum.unitMultiplier,
    nokAmount: nokAmountFromExchangeRateData(amount, rateDatum),
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

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

/** Format an exchange rate for display (4 decimal places, Norwegian locale). */
export function formatExchangeRate(
  rate: number,
  unitMultiplier: number,
): string {
  const normalizedRate = rate / unitMultiplier
  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(normalizedRate)
}

// ---------------------------------------------------------------------------
// Internal date helpers (avoid timezone pitfalls with ISO date strings)
// ---------------------------------------------------------------------------

/** Format a Date as "YYYY-MM-DD" using local date parts (no timezone shift). */
function toISODateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Parse "YYYY-MM-DD" into a local Date at midnight (no timezone shift). */
function parseISODateString(str: string): Date {
  const [y, m, d] = str.split("-").map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}
