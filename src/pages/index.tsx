import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { getSymbolFromCurrency } from "country-data-list"
import { CalendarIcon, Check, Copy, Mail, Plus, Trash2 } from "lucide-react"
import React, { useState } from "react"
import { enGB, nb } from "react-day-picker/locale"
import { type Control, useFieldArray, useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { BankDetailsForm } from "@/components/BankDetailsForm"
import { FileUploader } from "@/components/FileUploader"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Country, CountryDropdown } from "@/components/ui/country-dropdown"
import { CurrencyDropdown } from "@/components/ui/currency-dropdown"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  findCountryByCodeOrName,
  getDisplayLocaleFromCountry,
  getWeekStartsOnFromLocale,
} from "@/lib/country"
import { resolvePayoutCurrency } from "@/lib/currency-country"
import { formatDate, formatDateLong } from "@/lib/date-format"
import {
  type ExchangeRateDatum,
  exchangeRateDisplayInfo,
  fetchExchangeRateData,
  formatExchangeRate,
} from "@/lib/exchange-rates"
import {
  createExpenseSchemas,
  type ExpenseReportFormValues,
} from "@/lib/expense-schema"
import { generatePDF } from "@/lib/pdf"
import { cn, formatCurrency } from "@/lib/utils"

const LOGO_URL = "/img/logos/TDC_white.png"
let cachedLogoBytes: ArrayBuffer | undefined | null = null

/** Fetches logo once per session for PDF generation; pdf-lib needs raw bytes, not a URL. */
async function getCachedLogoBytes(): Promise<ArrayBuffer | undefined> {
  if (cachedLogoBytes !== null) return cachedLogoBytes ?? undefined
  try {
    const res = await fetch(LOGO_URL)
    if (res.ok) cachedLogoBytes = await res.arrayBuffer()
    else cachedLogoBytes = undefined
  } catch {
    cachedLogoBytes = undefined
  }
  return cachedLogoBytes ?? undefined
}

function getString(
  query: Record<string, string | string[] | undefined>,
  key: string,
  defaultValue: string = "",
): string {
  const value = query[key] ?? query[key.toLowerCase()]
  if (value === undefined || value === null) return defaultValue
  if (Array.isArray(value)) return value[0] ?? defaultValue
  return value ?? defaultValue
}

function parseFormQueryParams(
  query: Record<string, string | string[] | undefined>,
) {
  const langRaw = getString(query, "lang", "").toLowerCase()
  const language = langRaw === "en" || langRaw === "no" ? langRaw : undefined

  const rawCountry = getString(query, "country", "")
  let country = rawCountry
  let countryIso2ForHeuristic: string | undefined
  if (rawCountry) {
    const match = findCountryByCodeOrName(rawCountry)
    if (match?.alpha3) {
      country = match.alpha3
    }
    if (match?.alpha2) {
      countryIso2ForHeuristic = match.alpha2
    }
  } else {
    country = ""
    countryIso2ForHeuristic = undefined
  }

  const internationalParamRaw = getString(query, "international", "")
  const internationalParam =
    internationalParamRaw === "" ? "" : internationalParamRaw.toLowerCase()

  const residesInNorway: boolean =
    internationalParam === ""
      ? countryIso2ForHeuristic
        ? countryIso2ForHeuristic.toUpperCase() === "NO"
        : true
      : internationalParam !== "true"

  const rawBankCountry = getString(query, "bankCountry", "")
  const rawBankCountryIso2 = getString(query, "bankCountryIso2", "")
  let bankCountry = ""
  let bankCountryIso2 = ""

  if (rawBankCountry || rawBankCountryIso2) {
    const source = rawBankCountry || rawBankCountryIso2
    const match = findCountryByCodeOrName(source)
    if (match?.alpha3) {
      bankCountry = match.alpha3
    } else if (rawBankCountry) {
      bankCountry = rawBankCountry
    }
    if (match?.alpha2) {
      bankCountryIso2 = match.alpha2
    }
  }

  if (!bankCountryIso2 && rawBankCountryIso2) {
    bankCountryIso2 = rawBankCountryIso2.toUpperCase()
  }

  return {
    language,
    name: getString(query, "name", ""),
    email: getString(query, "email", ""),
    streetAddress: getString(query, "streetAddress", ""),
    postalCode: getString(query, "postalCode", ""),
    city: getString(query, "city", ""),
    country,
    residesInNorway,
    bankCountry,
    bankCountryIso2,
    bankIban: getString(query, "bankIban", getString(query, "bankAccount", "")),
    bankRoutingNumber: getString(query, "bankRoutingNumber", ""),
    bankAccountNumber: getString(query, "bankAccountNumber", ""),
    bankAccountType: getString(query, "bankAccountType", "checking"),
    bankSwiftBic: getString(query, "bankSwiftBic", ""),
    bankName: getString(query, "bankName", ""),
    bankAddress: getString(query, "bankAddress", ""),
    bankAccountHolderName: getString(query, "bankAccountHolderName", ""),
    // Payout currency based on bank country, defaulting to NOK
    targetCurrency: resolvePayoutCurrency(residesInNorway, bankCountryIso2),
  }
}

type InitialFormValues = ReturnType<typeof parseFormQueryParams>

/** Build query record from client-side search string (e.g. window.location.search). */
function searchToQueryRecord(
  search: string,
): Record<string, string | string[] | undefined> {
  if (!search || search === "?") return {}
  return Object.fromEntries(new URLSearchParams(search).entries())
}

type ExpenseAmountInputProps = {
  control: Control<ExpenseReportFormValues>
  name: `expenses.${number}.amount`
  currencyName: `expenses.${number}.currency`
  dateName: `expenses.${number}.date`
  label: string
  t: (key: string, options?: Record<string, string | number>) => string
  /** Locale for formatting (e.g. from selected country). Falls back to browser language. */
  displayLocale?: string
  /** Target currency for conversion (bank country currency) */
  targetCurrency: string
}

function parseAmountInput(raw: string): number {
  const trimmed = raw.trim().replace(/\s/g, "")
  if (trimmed === "" || trimmed === "." || trimmed === ",") return 0

  const lastComma = trimmed.lastIndexOf(",")
  const lastPeriod = trimmed.lastIndexOf(".")

  let normalized: string
  if (lastComma > lastPeriod) {
    // Comma is decimal separator (e.g. European "99.999,00")
    normalized = trimmed.replace(/\./g, "").replace(",", ".")
  } else if (lastPeriod > lastComma) {
    // Period is decimal separator (e.g. US "99,999.00")
    normalized = trimmed.replace(/,/g, "")
  } else {
    normalized = trimmed.replace(",", ".")
  }

  const num = parseFloat(normalized)
  if (Number.isNaN(num) || num < 0) return 0
  return Math.round(num * 100) / 100
}

function ExpenseAmountInput({
  control,
  name,
  currencyName,
  dateName,
  label,
  t,
  displayLocale: displayLocaleProp,
  targetCurrency,
}: ExpenseAmountInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [localValue, setLocalValue] = useState("")

  // FieldPath is now specific to expense items, so useWatch can properly infer the return type
  const selectedCurrencyCode = useWatch({
    control,
    name: currencyName,
  })
  const selectedDate = useWatch({
    control,
    name: dateName,
  })
  const amount = useWatch({ control, name })
  const symbol = selectedCurrencyCode
    ? getSymbolFromCurrency(selectedCurrencyCode)
    : ""

  const dateKey = selectedDate ? selectedDate.toISOString().slice(0, 10) : ""

  // Show exchange rate info when expense currency differs from target currency
  const needsConversion = Boolean(
    selectedCurrencyCode && selectedCurrencyCode !== targetCurrency,
  )

  const exchangeRateQueryEnabled = Boolean(
    selectedCurrencyCode && selectedDate && (amount ?? 0) > 0,
  )

  const { data: rateData } = useQuery<
    ExchangeRateDatum | null,
    Error,
    ExchangeRateDatum | null,
    readonly ["norgesBankExchangeRate", string, string]
  >({
    queryKey: [
      "norgesBankExchangeRate",
      selectedCurrencyCode,
      dateKey,
    ] as const,
    queryFn: () => {
      if (!selectedCurrencyCode || !selectedDate) {
        return Promise.resolve(null)
      }
      return fetchExchangeRateData(selectedCurrencyCode, selectedDate)
    },
    enabled: exchangeRateQueryEnabled && needsConversion,
    staleTime: 1000 * 60 * 60,
  })

  // Fetch target currency rate when conversion is needed
  const { data: targetRateData } = useQuery<
    ExchangeRateDatum | null,
    Error,
    ExchangeRateDatum | null,
    readonly ["norgesBankExchangeRate", string, string]
  >({
    queryKey: ["norgesBankExchangeRate", targetCurrency, dateKey] as const,
    queryFn: () => {
      if (!targetCurrency || !selectedDate) {
        return Promise.resolve(null)
      }
      return fetchExchangeRateData(targetCurrency, selectedDate)
    },
    enabled: exchangeRateQueryEnabled && needsConversion,
    staleTime: 1000 * 60 * 60,
  })

  const exchangeRateInfo = exchangeRateDisplayInfo(
    selectedCurrencyCode,
    targetCurrency,
    selectedDate,
    amount ?? 0,
    rateData,
    targetRateData,
  )

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const amountValue = field.value
        const displayLocale =
          displayLocaleProp ||
          (typeof navigator !== "undefined" ? navigator.language : "en-GB")
        const displayValue = isFocused
          ? localValue
          : amountValue
            ? formatCurrency(amountValue, displayLocale)
            : ""

        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <div className="relative w-full">
              <FormControl>
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  {...field}
                  value={displayValue}
                  disabled={!selectedCurrencyCode}
                  onChange={(e) => {
                    setLocalValue(e.target.value)
                    field.onChange(parseAmountInput(e.target.value))
                  }}
                  onFocus={() => {
                    setIsFocused(true)
                    setLocalValue(
                      amountValue != null && amountValue !== 0
                        ? formatCurrency(amountValue, displayLocale)
                        : "",
                    )
                  }}
                  onBlur={() => {
                    const parsed = parseAmountInput(localValue)
                    field.onChange(parsed)
                    setLocalValue("")
                    setIsFocused(false)
                    field.onBlur()
                  }}
                  ref={field.ref}
                  name={field.name}
                  className="pr-10"
                />
              </FormControl>
              {symbol ? (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {symbol}
                </span>
              ) : null}
            </div>
            {exchangeRateInfo && (
              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                <div>
                  {t("expense.exchangeRate", {
                    sourceCurrency: exchangeRateInfo.sourceCurrency,
                    rate: formatExchangeRate(exchangeRateInfo.crossRate, 1),
                    targetCurrency: exchangeRateInfo.targetCurrency,
                    date: formatDate(exchangeRateInfo.date),
                  })}
                </div>
                <div className="font-medium text-foreground">
                  {t("expense.youGetBack", {
                    amount: formatCurrency(
                      exchangeRateInfo.targetAmount,
                      "nb-NO",
                    ),
                    currency: exchangeRateInfo.targetCurrency,
                  })}
                </div>
              </div>
            )}
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}

export default function ExpensePage() {
  const [initialFormValues] = useState<InitialFormValues>(() =>
    parseFormQueryParams({}),
  )

  const { t, i18n } = useTranslation("common")

  const { formSchema } = createExpenseSchemas()
  type FormValues = z.infer<typeof formSchema>

  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    shouldUnregister: false,
    defaultValues: {
      name: initialFormValues.name,
      streetAddress: initialFormValues.streetAddress,
      postalCode: initialFormValues.postalCode,
      city: initialFormValues.city,
      country: initialFormValues.country,
      residesInNorway: initialFormValues.residesInNorway,
      bankCountry: initialFormValues.bankCountry,
      bankCountryIso2: initialFormValues.bankCountryIso2,
      bankIban: initialFormValues.bankIban,
      bankRoutingNumber: initialFormValues.bankRoutingNumber,
      bankAccountNumber: initialFormValues.bankAccountNumber,
      bankAccountType:
        initialFormValues.bankAccountType === "savings"
          ? ("savings" as const)
          : ("checking" as const),
      bankSwiftBic: initialFormValues.bankSwiftBic,
      bankName: initialFormValues.bankName,
      bankAddress: initialFormValues.bankAddress,
      bankAccountHolderName: initialFormValues.bankAccountHolderName,
      skipBankValidation: false,
      targetCurrency: initialFormValues.targetCurrency,
      email: initialFormValues.email,
      expenses: [
        {
          description: "",
          amount: 0,
          currency: initialFormValues.targetCurrency || "NOK",
          date: new Date(),
          attachment: undefined as unknown as File,
        },
      ],
    },
  })

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const queryRecord = searchToQueryRecord(window.location.search)
    if (!Object.keys(queryRecord).length) return

    const parsed = parseFormQueryParams(queryRecord)

    if (parsed.language && i18n.language !== parsed.language) {
      void i18n.changeLanguage(parsed.language)
    }

    form.reset({
      ...form.getValues(),
      ...parsed,
      bankAccountType:
        parsed.bankAccountType === "savings"
          ? ("savings" as const)
          : ("checking" as const),
    })
  }, [form, i18n])

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "expenses",
  })

  const residesInNorway = form.watch("residesInNorway")
  const targetCurrency = form.watch("targetCurrency") ?? "NOK"
  const dirtyFields = form.formState.dirtyFields
  const previousTargetCurrencyRef = React.useRef(targetCurrency)
  React.useEffect(() => {
    const previousTargetCurrency = previousTargetCurrencyRef.current
    if (previousTargetCurrency === targetCurrency) return
    previousTargetCurrencyRef.current = targetCurrency

    // Follow the new payout currency only on pristine rows still on the old
    // default. A dirty expense has been touched, so leave its currency alone.
    form.getValues("expenses").forEach((expense, index) => {
      if (dirtyFields.expenses?.[index]) return
      if (expense.currency !== previousTargetCurrency) return
      form.resetField(`expenses.${index}.currency`, {
        defaultValue: targetCurrency,
      })
    })
  }, [targetCurrency, form, dirtyFields])
  const watchedName = form.watch("name") ?? ""
  const watchedExpenses = form.watch("expenses") ?? []
  const targetEmail = "faktura@trondheimdc.no"
  const [hasCopiedEmail, setHasCopiedEmail] = useState(false)
  const emailDate =
    watchedExpenses[0]?.date instanceof Date
      ? watchedExpenses[0].date
      : new Date()
  const emailDateStr = emailDate.toLocaleDateString("sv")
  const emailDescriptions = watchedExpenses
    .map((expense) => expense.description)
    .filter(Boolean)
    .join(", ")
  const mailtoHref = `mailto:${targetEmail}?subject=${encodeURIComponent(
    t("expense.emailSubject", { date: emailDateStr, name: watchedName }),
  )}&body=${encodeURIComponent(
    t("expense.emailBody", {
      descriptions: emailDescriptions,
      name: watchedName,
    }),
  )}`

  const handleResidenceChange = (value: string) => {
    const isNorway = value === "norway"
    form.setValue("residesInNorway", isNorway)
    form.setValue(
      "targetCurrency",
      resolvePayoutCurrency(isNorway, form.getValues("bankCountryIso2")),
    )
  }

  const watchedCountry = form.watch("country")
  const homeLocale = React.useMemo(() => {
    if (residesInNorway) return "nb-NO"
    if (watchedCountry) return getDisplayLocaleFromCountry(watchedCountry)
    return undefined
  }, [residesInNorway, watchedCountry])
  const amountDisplayLocale =
    homeLocale ??
    (typeof navigator !== "undefined" ? navigator.language : "en-GB")
  // Deliberately doesn't fall back to navigator.language: with no country
  // picked yet, Monday is a better default than a guess from the browser.
  const calendarWeekStartsOn = React.useMemo(
    () => getWeekStartsOnFromLocale(homeLocale),
    [homeLocale],
  )
  const isDirty = form.formState.isDirty
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault()
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [isDirty])

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true)

    const normalizedData: FormValues = {
      ...data,
      // Always ensure Norway is used when the user resides in Norway,
      // regardless of any existing country value.
      country: data.residesInNorway ? "Norway" : data.country,
    }

    try {
      const logoPngBytes = await getCachedLogoBytes()

      // PDF country names are always in Norwegian
      const regionNames = new Intl.DisplayNames(["nb"], { type: "region" })
      const countryMatch = findCountryByCodeOrName(normalizedData.country)
      const countryAlpha2 = countryMatch?.alpha2
      const countryDisplayName = countryAlpha2
        ? (regionNames.of(countryAlpha2.toUpperCase()) ??
          normalizedData.country)
        : normalizedData.country
      const bankCountryDisplayName = normalizedData.bankCountryIso2
        ? (regionNames.of(normalizedData.bankCountryIso2.toUpperCase()) ??
          normalizedData.bankCountry ??
          "")
        : (normalizedData.bankCountry ?? "")

      const expenseReport = await generatePDF({
        ...normalizedData,
        validationSkipped: normalizedData.skipBankValidation ?? false,
        logoPngBytes,
        countryDisplayName,
        bankCountryDisplayName,
      })

      const blob = new Blob([expenseReport as BlobPart], {
        type: "application/pdf",
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url

      const today = new Date()
      const todayStr = today.toISOString().split("T")[0]
      const sanitizedName = normalizedData.name
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()

      link.setAttribute(
        "download",
        `${todayStr}-${sanitizedName}-expense-report.pdf`,
      )
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error generating PDF:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const resizeImage = async (
    file: File,
    options: { maxWidth: number; maxHeight: number; quality: number },
  ): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.src = URL.createObjectURL(file)

      img.onload = () => {
        const canvas = document.createElement("canvas")
        let { width, height } = img

        if (width > options.maxWidth) {
          height = (height * options.maxWidth) / width
          width = options.maxWidth
        }
        if (height > options.maxHeight) {
          width = (width * options.maxHeight) / height
          height = options.maxHeight
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext("2d")
        ctx?.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: "image/jpeg" }))
            }
          },
          "image/jpeg",
          options.quality,
        )

        URL.revokeObjectURL(img.src)
      }
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-24">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {t("expense.title")}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {t("expense.subtitle")}
        </p>
      </div>

      <Form {...form}>
        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-6"
        >
          {/* Residence toggle */}
          <Tabs
            value={residesInNorway ? "norway" : "abroad"}
            onValueChange={handleResidenceChange}
            className="w-full"
          >
            <TabsList
              className="grid w-full grid-cols-2"
              aria-label={t("expense.residenceLabel")}
            >
              <TabsTrigger value="norway">
                {t("expense.residesInNorway")}
              </TabsTrigger>
              <TabsTrigger value="abroad">
                {t("expense.residesAbroad")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Bank details */}
          <section className="rounded-xl border border-input bg-card p-5 shadow-md">
            <h2 className="text-lg font-semibold text-foreground">
              {t("expense.bankAccount")}
            </h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              {residesInNorway
                ? t("expense.bankDescriptionNorwegian")
                : t("expense.bankDescriptionInternational")}
            </p>

            <BankDetailsForm
              form={form}
              t={t}
              language={i18n.language}
              isInternational={!residesInNorway}
            />
          </section>

          {/* Personal information */}
          <section className="rounded-xl border border-input bg-card p-5 shadow-md">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              {t("expense.personalInfo")}
            </h2>

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("expense.name")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("expense.namePlaceholder")}
                        autoComplete="name"
                        required
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("expense.email")}</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        required
                        placeholder={t("expense.emailPlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="streetAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("expense.address")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("expense.addressPlaceholder")}
                        autoComplete="street-address"
                        required
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("expense.postalCode")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("expense.postalCodePlaceholder")}
                          autoComplete="postal-code"
                          required
                          {...field}
                          onChange={(e) => {
                            const value = residesInNorway
                              ? e.target.value.replace(/\D/g, "")
                              : e.target.value
                            field.onChange(value)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("expense.city")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("expense.cityPlaceholder")}
                          autoComplete="address-level2"
                          required
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {!residesInNorway && (
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("expense.country")}</FormLabel>
                      <FormControl>
                        <CountryDropdown
                          {...field}
                          defaultValue={field.value}
                          autoComplete="country-name"
                          aria-required="true"
                          onChange={(country: Country) => {
                            form.setValue(field.name, country?.alpha3 || "")
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </section>

          {/* Expenses */}
          <section className="rounded-xl border border-input bg-card p-5 shadow-md">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              {t("expense.expenses")}
            </h2>

            <div className="space-y-5">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className={cn(
                    "relative space-y-3 rounded-lg border border-border bg-background/80 p-4",
                    index > 0 && "border-t border-border",
                  )}
                >
                  {fields.length > 1 && (
                    <div className="absolute right-3 top-3 z-10">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        aria-label={t("expense.removeExpense")}
                        className="gap-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name={`expenses.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("expense.description")}</FormLabel>
                        <FormDescription>
                          {t("expense.descriptionDescription")}
                        </FormDescription>
                        <FormControl>
                          <Input
                            {...field}
                            required
                            placeholder={t("expense.descriptionPlaceholder")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                    <FormField
                      control={form.control}
                      name={`expenses.${index}.date`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("expense.date")}</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  aria-required="true"
                                  className={cn(
                                    "w-full bg-background pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground",
                                  )}
                                >
                                  {field.value ? (
                                    formatDateLong(
                                      field.value,
                                      i18n.language === "no" ? "no" : "en",
                                    )
                                  ) : (
                                    <span>{t("expense.selectDate")}</span>
                                  )}
                                  <CalendarIcon
                                    className="ml-auto h-4 w-4 opacity-50"
                                    aria-hidden="true"
                                  />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto p-0"
                              align="start"
                            >
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                locale={i18n.language === "no" ? nb : enGB}
                                weekStartsOn={calendarWeekStartsOn}
                                disabled={(date) =>
                                  date > new Date() ||
                                  date < new Date("2020-01-01")
                                }
                                autoFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <ExpenseAmountInput
                      control={form.control}
                      name={`expenses.${index}.amount`}
                      currencyName={`expenses.${index}.currency`}
                      dateName={`expenses.${index}.date`}
                      label={t("expense.amount")}
                      t={t}
                      displayLocale={amountDisplayLocale}
                      targetCurrency={targetCurrency}
                    />

                    <FormField
                      control={form.control}
                      name={`expenses.${index}.currency`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("expense.currency")}</FormLabel>
                          <FormControl>
                            <CurrencyDropdown
                              slim={true}
                              value={field.value}
                              onValueChange={field.onChange}
                              placeholder={t("expense.selectCurrency")}
                              currencies="custom"
                              aria-required="true"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name={`expenses.${index}.attachment`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("expense.attachment")}</FormLabel>
                        <FormControl>
                          <FileUploader
                            onUpload={async (files) => {
                              const file = files[0]
                              if (!file) {
                                field.onChange(undefined)
                                return
                              }

                              if (file.type.startsWith("image/")) {
                                const resizedFile = await resizeImage(file, {
                                  maxWidth: 1800,
                                  maxHeight: 1800,
                                  quality: 0.8,
                                })
                                field.onChange(resizedFile)
                              } else {
                                field.onChange(file)
                              }
                            }}
                            accept={{
                              "image/*": [],
                              "application/pdf": [],
                            }}
                            maxSize={10 * 1024 * 1024}
                            {...field}
                            required
                            value={field.value?.size > 0 ? [field.value] : []}
                            onValueChange={(files) => {
                              const file = files?.[0]
                              field.onChange(
                                file && file?.size > 0 ? file : undefined,
                              )
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>

            {fields.length > 0 && (
              <div className="flex justify-center pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    append({
                      description: "",
                      amount: 0,
                      currency: targetCurrency,
                      date: new Date(),
                      attachment: new File([], ""),
                    })
                  }
                  className="gap-2 border-dashed border-input text-muted-foreground hover:border-accent-foreground hover:bg-accent"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("expense.addExpense")}
                </Button>
              </div>
            )}
          </section>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={isLoading} className="px-6">
              {isLoading
                ? t("expense.processing")
                : t("expense.generateReport")}
            </Button>
            <Button
              type="button"
              variant="outline"
              asChild
              className="flex items-center gap-2 border-input text-foreground hover:bg-accent"
            >
              <a target="_blank" href={mailtoHref} rel="noopener">
                <Mail className="h-4 w-4" aria-hidden="true" />
                {t("expense.sendEmail")}
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex items-center gap-2 border-input text-foreground hover:bg-accent"
              onClick={() => {
                if (navigator?.clipboard?.writeText) {
                  navigator.clipboard.writeText(targetEmail).then(() => {
                    setHasCopiedEmail(true)
                    window.setTimeout(() => setHasCopiedEmail(false), 2000)
                  })
                }
              }}
            >
              {hasCopiedEmail ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {hasCopiedEmail
                ? t("expense.emailCopied")
                : t("expense.copyEmail")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
