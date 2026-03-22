type ExchangeRateDatum = {
  rate: number
  unitMultiplier: number
  rateDate: Date
}

type ExchangeRateDisplayRow = {
  rate: number
  date: Date
  nokAmount: number
  unitMultiplier: number
}

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
): Promise<ExchangeRateDatum | null> {
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
