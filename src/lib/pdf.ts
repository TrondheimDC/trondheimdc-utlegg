// The utleggsrapport PDF, format 2. The layout is a contract with trondheimdc-regnskap, which
// reads the visible text: see docs/pdf-format.md before changing any printed label.

import fontkit from "@pdf-lib/fontkit"
import {
  type Color,
  degrees,
  PDFDocument,
  type PDFDocument as PDFDocumentType,
  type PDFEmbeddedPage,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib"
import type { z } from "zod"
import {
  formatIBANForDisplay,
  formatNorwegianBBANForDisplay,
  getBankCountryType,
} from "@/lib/banking"
import { resolvePayoutCurrency } from "@/lib/currency-country"
import { formatDate } from "@/lib/date-format"
import {
  type ConversionResult,
  convertCurrency,
  formatExchangeRate,
} from "@/lib/exchange-rates"
import { categoryPdfLabel } from "@/lib/expense-categories"
import type { createExpenseSchemas } from "@/lib/expense-schema"

export const PDF_FORMAT_VERSION = 2

type FormValues = z.infer<ReturnType<typeof createExpenseSchemas>["formSchema"]>

/** The TDC faces (trondheimdc.no design tokens): IBM Plex Sans for text, Space Grotesk for headings. */
export interface PdfFonts {
  regular: ArrayBuffer
  semibold: ArrayBuffer
  display: ArrayBuffer
}

export type GeneratePdfInput = FormValues & {
  /** "UT-20261106-7KQ2", from createReportId(). */
  reportId: string
  generatedAt?: Date
  validationSkipped?: boolean
  /** Full country name for the address (e.g. "Norge"). When not set, `country` is used. */
  countryDisplayName?: string
  /** Full bank country name (e.g. "Tyskland"). */
  bankCountryDisplayName?: string
  /** Without them the PDF falls back to Helvetica (Latin-1 only). */
  fonts?: PdfFonts
  /** Exchange rate lookup; defaults to Norges Bank. Replaceable for samples and tests. */
  convert?: typeof convertCurrency
}

// ---------------------------------------------------------------------------------------------
// Design tokens

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 48
const MARGIN_TOP = 44
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X
const FOOTER_Y = 30
/** Nothing but the footer goes below this line. */
const CONTENT_BOTTOM = 62

const hex = (value: string): Color =>
  rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  )

// From the trondheimdc.no design tokens (as in forening, forms and regnskap), for paper:
// black, white-2, yellow-2 and the red scale; the greys in between are neutral steps.
const COLORS = {
  ink: hex("#0f0f0f"), // --color-black
  body: hex("#292929"), // --color-black-3
  muted: hex("#6b6b6b"),
  faint: hex("#9a9a9a"),
  rule: hex("#e3e3e3"),
  surface: hex("#f4f4f4"), // --color-white-2
  pill: hex("#ebebeb"),
  brand: hex("#ffd12e"), // --color-yellow-2 (--color-fg-accent)
  warnInk: hex("#901a09"), // --color-red-4
  warnSurface: hex("#fdecea"),
  warnRule: hex("#f6b8ae"),
}

const SIZE = {
  title: 26,
  subtitle: 10.5,
  label: 7.5,
  value: 10,
  cell: 9,
  small: 7.5,
  footer: 7.5,
}

// The TrondheimDC mark from public/img/logos/TDC_white.svg, drawn as vectors in ink.
const LOGO_VIEWBOX = { width: 297, height: 121 }
const LOGO_PATHS = [
  "M92.6294 0H0V40.2024H92.6294V0Z",
  "M69.3354 40.0204H22.9297V80.2229H69.3354V40.0204Z",
  "M69.3354 80.0411H22.9297V120.244H69.3354V80.0411Z",
  "M101.728 0H154.139C176.341 0 194.358 18.0092 194.358 40.2024H101.728V0Z",
  "M194.358 40.0204H101.728V80.2229H194.358V40.0204Z",
  "M101.728 80.0411H194.358C194.358 102.234 176.341 120.244 154.139 120.244H101.728V80.0411Z",
  "M243.675 0H296.087V40.2024H203.457C203.275 18.0092 221.473 0 243.675 0Z",
  "M249.681 40.0204H203.275V80.2229H249.681V40.0204Z",
  "M203.275 80.0411H295.905V120.244H243.493C221.473 120.425 203.275 102.416 203.275 80.0411Z",
]

// Table columns, as offsets from the left margin. Amount columns are right-aligned to x + width.
// Neighbouring cells keep at least ~10pt apart: closer than about one character, a PDF text
// extractor reads them as one cell (trondheimdc-regnskap merges at 0.8 × font size).
const COLUMNS = {
  number: { x: 0, width: 26, header: "#", align: "left" },
  date: { x: 26, width: 62, header: "Dato", align: "left" },
  description: { x: 88, width: 164, header: "Beskrivelse", align: "left" },
  category: { x: 252, width: 72, header: "Kategori", align: "left" },
  amount: { x: 324, width: 86, header: "Beløp", align: "right" },
  payout: { x: 410, width: CONTENT_WIDTH - 410, header: "", align: "right" },
} as const
const DESCRIPTION_TEXT_WIDTH = COLUMNS.description.width - 10
/** From a row's last baseline down to the rule under it, and from that rule to the next baseline. */
const ROW_GAP_BELOW = 7
const ROW_GAP_ABOVE = 14

// ---------------------------------------------------------------------------------------------
// Formatting: explicit, so the output doesn't depend on the browser's locale data.

/** 1234.5 -> "1 234,50" (plain spaces, comma decimal). */
export function formatAmount(value: number): string {
  const cents = Math.round(Math.abs(value) * 100)
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  const fraction = String(cents % 100).padStart(2, "0")
  return `${value < 0 ? "-" : ""}${whole},${fraction}`
}

function toCents(value: number): number {
  return Math.round(value * 100)
}

// ---------------------------------------------------------------------------------------------
// The report model: everything the layout needs, computed before drawing.

interface ReportRow {
  n: number
  date: Date
  description: string
  category: string
  original: { amount: number; currency: string }
  /** In the payout currency, øre. Undefined when there was no exchange rate. */
  payoutCents?: number
  conversion?: ConversionResult
  attachment: File
}

interface Field {
  label: string
  value: string
}

async function buildRows(
  input: GeneratePdfInput,
  payoutCurrency: string,
): Promise<ReportRow[]> {
  const convert = input.convert ?? convertCurrency
  return Promise.all(
    input.expenses.map(async (expense, index): Promise<ReportRow> => {
      const base = {
        n: index + 1,
        date: expense.date,
        description: expense.description.trim(),
        category: categoryPdfLabel(expense.category),
        original: { amount: expense.amount, currency: expense.currency },
        attachment: expense.attachment,
      }
      if (expense.currency === payoutCurrency)
        return { ...base, payoutCents: toCents(expense.amount) }
      const conversion = await convert(
        expense.amount,
        expense.currency,
        payoutCurrency,
        expense.date,
      )
      return conversion
        ? { ...base, payoutCents: toCents(conversion.amount), conversion }
        : base
    }),
  )
}

function payoutFields(
  input: GeneratePdfInput,
  payoutCurrency: string,
): Field[] {
  const currency = { label: "Valuta", value: payoutCurrency }
  if (input.residesInNorway ?? true) {
    return [
      {
        label: "Kontonummer",
        value: formatNorwegianBBANForDisplay(input.bankAccountNumber || ""),
      },
      currency,
    ]
  }
  const country = { label: "Land", value: input.bankCountryDisplayName ?? "" }
  const bic = { label: "BIC", value: (input.bankSwiftBic ?? "").toUpperCase() }
  const type = getBankCountryType(input.bankCountryIso2 || "")
  if (type === "sepa") {
    return [
      country,
      { label: "IBAN", value: formatIBANForDisplay(input.bankIban || "") },
      bic,
      currency,
    ]
  }
  const bankFields = [
    bic,
    { label: "Bank", value: input.bankName ?? "" },
    { label: "Bankadresse", value: input.bankAddress ?? "" },
    { label: "Kontoinnehaver", value: input.bankAccountHolderName ?? "" },
  ]
  if (type === "us") {
    return [
      country,
      { label: "Routingnummer", value: input.bankRoutingNumber ?? "" },
      { label: "Kontonummer (utland)", value: input.bankAccountNumber ?? "" },
      {
        label: "Kontotype",
        value: input.bankAccountType === "savings" ? "Savings" : "Checking",
      },
      ...bankFields,
      currency,
    ]
  }
  return [
    country,
    { label: "Kontonummer (utland)", value: input.bankAccountNumber ?? "" },
    ...(input.bankIban
      ? [{ label: "IBAN", value: formatIBANForDisplay(input.bankIban) }]
      : []),
    ...bankFields,
    currency,
  ]
}

// ---------------------------------------------------------------------------------------------
// Drawing primitives

interface Fonts {
  regular: PDFFont
  semibold: PDFFont
  /** Headings. */
  display: PDFFont
}

async function embedFonts(
  doc: PDFDocumentType,
  fonts?: PdfFonts,
): Promise<Fonts> {
  if (!fonts) {
    const semibold = await doc.embedFont(StandardFonts.HelveticaBold)
    return {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      semibold,
      display: semibold,
    }
  }
  doc.registerFontkit(fontkit)
  // Nothing that swaps glyphs behind the text's back: ligatures, contextual alternates
  // and fractions ("1/2" becomes one glyph). Plex's figures are tabular already, so
  // amounts line up in their columns without asking.
  const features = {
    liga: false,
    calt: false,
    frac: false,
    numr: false,
    dnom: false,
  }
  const embed = (bytes: ArrayBuffer) =>
    doc.embedFont(bytes, { subset: true, features })
  return {
    regular: await embed(fonts.regular),
    semibold: await embed(fonts.semibold),
    display: await embed(fonts.display),
  }
}

const characterSets = new WeakMap<PDFFont, Set<number>>()

/** Replaces what the font can't draw: whitespace with a space, other characters with "?". */
function printable(font: PDFFont, text: string): string {
  let set = characterSets.get(font)
  if (!set) {
    set = new Set(font.getCharacterSet())
    characterSets.set(font, set)
  }
  let out = ""
  for (const char of text.normalize("NFC")) {
    if (/\s/.test(char)) out += " "
    else out += set.has(char.codePointAt(0) ?? 0) ? char : "?"
  }
  return out
}

interface TextStyle {
  font: PDFFont
  size: number
  color: Color
}

function widthOf(text: string, style: TextStyle): number {
  return style.font.widthOfTextAtSize(printable(style.font, text), style.size)
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
  align: "left" | "right" = "left",
) {
  const safe = printable(style.font, text)
  const width = style.font.widthOfTextAtSize(safe, style.size)
  page.drawText(safe, {
    x: align === "right" ? x - width : x,
    y,
    size: style.size,
    font: style.font,
    color: style.color,
  })
  return width
}

/** Breaks text into lines no wider than maxWidth, at spaces where possible. */
function wrap(text: string, maxWidth: number, style: TextStyle): string[] {
  const words = printable(style.font, text).split(" ").filter(Boolean)
  const lines: string[] = []
  let line = ""
  const fits = (s: string) =>
    style.font.widthOfTextAtSize(s, style.size) <= maxWidth
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (fits(candidate)) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    // A single word wider than the column: break it by characters.
    let rest = word
    while (!fits(rest)) {
      let cut = rest.length - 1
      while (cut > 1 && !fits(rest.slice(0, cut))) cut--
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    line = rest
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : [""]
}

function hairline(
  page: PDFPage,
  y: number,
  color: Color = COLORS.rule,
  thickness = 0.6,
  from = MARGIN_X,
  to = PAGE_WIDTH - MARGIN_X,
) {
  page.drawLine({
    start: { x: from, y },
    end: { x: to, y },
    thickness,
    color,
  })
}

function drawLogo(page: PDFPage, x: number, top: number, height: number) {
  const scale = height / LOGO_VIEWBOX.height
  for (const path of LOGO_PATHS)
    page.drawSvgPath(path, { x, y: top, scale, color: COLORS.ink })
  return LOGO_VIEWBOX.width * scale
}

/** A small rounded tag, e.g. the category. Returns its width. */
function drawPill(
  page: PDFPage,
  text: string,
  x: number,
  baseline: number,
  style: TextStyle,
  align: "left" | "right" = "left",
) {
  const padX = 4.5
  const height = style.size + 5
  const width = widthOf(text, style) + 2 * padX
  const left = align === "right" ? x - width : x
  const bottom = baseline - 3.2
  const r = height / 2
  page.drawSvgPath(
    `M${r} 0 H${width - r} A${r} ${r} 0 0 1 ${width - r} ${height} H${r} A${r} ${r} 0 0 1 ${r} 0 Z`,
    { x: left, y: bottom + height, color: COLORS.pill },
  )
  drawText(page, text, left + padX, baseline, style)
  return width
}

// ---------------------------------------------------------------------------------------------
// The report

export async function generatePDF(
  input: GeneratePdfInput,
): Promise<Uint8Array> {
  const generatedAt = input.generatedAt ?? new Date()
  const payoutCurrency = resolvePayoutCurrency(
    input.residesInNorway ?? true,
    input.bankCountryIso2 || "",
  )
  const rows = await buildRows(input, payoutCurrency)
  const totalCents = rows.reduce((sum, r) => sum + (r.payoutCents ?? 0), 0)
  const name = input.name.trim()

  const doc = await PDFDocument.create()
  doc.setTitle(`Utleggsrapport ${input.reportId} – ${name}`)
  doc.setAuthor(name)
  doc.setSubject(`TrondheimDC utleggsrapport, format ${PDF_FORMAT_VERSION}`)
  doc.setKeywords([
    "utleggsrapport",
    `format-${PDF_FORMAT_VERSION}`,
    input.reportId,
  ])
  doc.setCreator("TrondheimDC utleggsskjema")
  doc.setLanguage("nb-NO")
  doc.setCreationDate(generatedAt)
  doc.setModificationDate(generatedAt)

  const fonts = await embedFonts(doc, input.fonts)
  const style = {
    title: { font: fonts.display, size: SIZE.title, color: COLORS.ink },
    subtitle: { font: fonts.regular, size: SIZE.subtitle, color: COLORS.muted },
    label: { font: fonts.semibold, size: SIZE.label, color: COLORS.muted },
    value: { font: fonts.regular, size: SIZE.value, color: COLORS.ink },
    valueStrong: { font: fonts.semibold, size: SIZE.value, color: COLORS.ink },
    section: { font: fonts.display, size: 11.5, color: COLORS.ink },
    cell: { font: fonts.regular, size: SIZE.cell, color: COLORS.body },
    cellMuted: { font: fonts.regular, size: SIZE.cell, color: COLORS.muted },
    figure: { font: fonts.regular, size: SIZE.cell, color: COLORS.body },
    figureMuted: {
      font: fonts.regular,
      size: SIZE.cell,
      color: COLORS.muted,
    },
    figureStrong: {
      font: fonts.semibold,
      size: SIZE.cell,
      color: COLORS.ink,
    },
    small: {
      font: fonts.regular,
      size: SIZE.small,
      color: COLORS.muted,
    },
    smallWarn: { font: fonts.regular, size: SIZE.small, color: COLORS.warnInk },
    pill: { font: fonts.semibold, size: SIZE.small, color: COLORS.ink },
    footer: { font: fonts.regular, size: SIZE.footer, color: COLORS.faint },
  } satisfies Record<string, TextStyle>

  const newPage = () => doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

  // --- Page 1: header -------------------------------------------------------------------------
  const cover = newPage()
  let y = PAGE_HEIGHT - MARGIN_TOP

  const logoHeight = 18
  const logoWidth = drawLogo(cover, MARGIN_X, y, logoHeight)
  drawText(
    cover,
    "TrondheimDC",
    MARGIN_X + logoWidth + 10,
    y - logoHeight + 4.5,
    { font: fonts.display, size: 10.5, color: COLORS.ink },
  )

  // Report id and date, top right: label above value, both left-aligned in their column.
  const dateText = formatDate(generatedAt)
  const dateColumnX = PAGE_WIDTH - MARGIN_X - widthOf("00.00.0000", style.value)
  const idColumnX =
    dateColumnX - 22 - widthOf(input.reportId, style.valueStrong)
  for (const [label, value, x, valueStyle] of [
    ["Rapport-ID", input.reportId, idColumnX, style.valueStrong],
    ["Dato", dateText, dateColumnX, style.value],
  ] as const) {
    drawText(cover, label, x, y - 6, style.label)
    drawText(cover, value, x, y - 19, valueStyle)
  }

  y -= 74
  drawText(cover, "Utleggsrapport", MARGIN_X, y, style.title)
  y -= 20
  const dates = rows.map((r) => r.date.getTime())
  const first = formatDate(new Date(Math.min(...dates)))
  const last = formatDate(new Date(Math.max(...dates)))
  const period = first === last ? first : `${first} – ${last}`
  drawText(
    cover,
    `${name} · ${rows.length} ${rows.length === 1 ? "kvittering" : "kvitteringer"} · ${period}`,
    MARGIN_X,
    y,
    style.subtitle,
  )
  y -= 16
  cover.drawRectangle({
    x: MARGIN_X,
    y,
    width: 28,
    height: 3,
    color: COLORS.brand,
  })
  y -= 30

  // --- Page 1: who and where to pay -----------------------------------------------------------
  const addressCountry = (
    input.countryDisplayName ??
    input.country ??
    ""
  ).trim()
  const address = [
    input.streetAddress?.trim(),
    [input.postalCode?.trim(), input.city?.trim()].filter(Boolean).join(" "),
    addressCountry,
  ]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")

  const columnGap = 28
  const columnWidth = (CONTENT_WIDTH - columnGap) / 2
  const drawFields = (
    heading: string,
    fields: Field[],
    x: number,
    top: number,
  ): number => {
    let cursor = top
    drawText(cover, heading, x, cursor, style.section)
    cursor -= 8
    hairline(cover, cursor, COLORS.rule, 0.6, x, x + columnWidth)
    cursor -= 16
    for (const field of fields) {
      drawText(cover, field.label, x, cursor, style.label)
      cursor -= 13
      for (const line of wrap(field.value || "–", columnWidth, style.value)) {
        drawText(cover, line, x, cursor, style.value)
        cursor -= 13
      }
      cursor -= 7
    }
    return cursor
  }
  const leftBottom = drawFields(
    "Utlegg fra",
    [
      { label: "Navn", value: name },
      { label: "Adresse", value: address },
      { label: "E-post", value: input.email.trim() },
    ],
    MARGIN_X,
    y,
  )
  const rightBottom = drawFields(
    "Utbetales til",
    payoutFields(input, payoutCurrency),
    MARGIN_X + columnWidth + columnGap,
    y,
  )
  y = Math.min(leftBottom, rightBottom) - 6

  if (input.validationSkipped) {
    const boxHeight = 38
    cover.drawRectangle({
      x: MARGIN_X,
      y: y - boxHeight,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: COLORS.warnSurface,
      borderColor: COLORS.warnRule,
      borderWidth: 0.6,
    })
    drawText(cover, "Kontonummeret er ikke validert", MARGIN_X + 12, y - 15, {
      font: fonts.semibold,
      size: 9.5,
      color: COLORS.warnInk,
    })
    drawText(
      cover,
      "Personen godtok at valideringen feilet. Sjekk kontonummeret før utbetaling.",
      MARGIN_X + 12,
      y - 28,
      { font: fonts.regular, size: 8.5, color: COLORS.warnInk },
    )
    y -= boxHeight + 18
  }

  // --- Page 1: summary ------------------------------------------------------------------------
  const summaryHeight = 54
  cover.drawRectangle({
    x: MARGIN_X,
    y: y - summaryHeight,
    width: CONTENT_WIDTH,
    height: summaryHeight,
    color: COLORS.surface,
  })
  const statLabelY = y - 19
  const statValueY = y - 38
  const stats: [string, string, number][] = [
    ["Antall kvitteringer", String(rows.length), MARGIN_X + 16],
    ["Periode", period, MARGIN_X + 140],
  ]
  for (const [label, value, x] of stats) {
    drawText(cover, label, x, statLabelY, style.label)
    drawText(cover, value, x, statValueY, style.value)
  }
  const sumRight = PAGE_WIDTH - MARGIN_X - 16
  drawText(cover, "Sum", sumRight, statLabelY, style.label, "right")
  const sumStyle = { font: fonts.semibold, size: 15, color: COLORS.ink }
  const sumCurrencyWidth = drawText(
    cover,
    payoutCurrency,
    sumRight,
    statValueY,
    { ...sumStyle, font: fonts.regular, color: COLORS.muted },
    "right",
  )
  drawText(
    cover,
    formatAmount(totalCents / 100),
    sumRight - sumCurrencyWidth - 5,
    statValueY,
    sumStyle,
    "right",
  )
  y -= summaryHeight + 30

  // --- The table, over as many pages as it needs ----------------------------------------------
  let page = cover
  const col = (key: keyof typeof COLUMNS) => MARGIN_X + COLUMNS[key].x
  const colRight = (key: keyof typeof COLUMNS) =>
    MARGIN_X + COLUMNS[key].x + COLUMNS[key].width
  const payoutHeader = `Utbetales (${payoutCurrency})`

  const drawTableHeader = () => {
    for (const key of Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]) {
      const column = COLUMNS[key]
      const text = key === "payout" ? payoutHeader : column.header
      if (column.align === "right")
        drawText(page, text, colRight(key), y, style.label, "right")
      else drawText(page, text, col(key), y, style.label)
    }
    y -= 7
    hairline(page, y, COLORS.ink, 0.8)
    y -= ROW_GAP_ABOVE + 1
  }

  drawText(page, "Kvitteringer", MARGIN_X, y, style.section)
  y -= 22
  drawTableHeader()

  const lineHeight = 12
  for (const row of rows) {
    const descriptionLines = wrap(
      row.description,
      DESCRIPTION_TEXT_WIDTH,
      style.cell,
    )
    const amountNote = row.conversion
      ? `kurs ${formatExchangeRate(row.conversion.rate, row.conversion.unitMultiplier)}`
      : row.payoutCents === undefined
        ? "kurs mangler"
        : undefined
    const lines = Math.max(descriptionLines.length, amountNote ? 2 : 1)
    if (y - (lines - 1) * lineHeight - ROW_GAP_BELOW < CONTENT_BOTTOM) {
      page = newPage()
      y = PAGE_HEIGHT - MARGIN_TOP - 8
      drawText(page, "Kvitteringer (forts.)", MARGIN_X, y, style.section)
      y -= 22
      drawTableHeader()
    }

    drawText(page, String(row.n), col("number"), y, style.figureMuted)
    drawText(page, formatDate(row.date), col("date"), y, style.figure)
    descriptionLines.forEach((line, i) => {
      drawText(page, line, col("description"), y - i * lineHeight, style.cell)
    })
    drawPill(page, row.category, col("category"), y, style.pill)
    drawText(
      page,
      `${formatAmount(row.original.amount)} ${row.original.currency}`,
      colRight("amount"),
      y,
      row.original.currency === payoutCurrency
        ? style.figureMuted
        : style.figure,
      "right",
    )
    if (amountNote)
      drawText(
        page,
        amountNote,
        colRight("amount"),
        y - lineHeight,
        row.payoutCents === undefined ? style.smallWarn : style.small,
        "right",
      )
    drawText(
      page,
      row.payoutCents === undefined ? "—" : formatAmount(row.payoutCents / 100),
      colRight("payout"),
      y,
      style.figureStrong,
      "right",
    )
    // Rule under the row's last line, then the next row's baseline.
    const ruleY = y - (lines - 1) * lineHeight - ROW_GAP_BELOW
    hairline(page, ruleY)
    y = ruleY - ROW_GAP_ABOVE
  }

  if (y - 24 < CONTENT_BOTTOM) {
    page = newPage()
    y = PAGE_HEIGHT - MARGIN_TOP - 8
    drawText(page, "Kvitteringer (forts.)", MARGIN_X, y, style.section)
    y -= 22
    drawTableHeader()
  }
  hairline(page, y + ROW_GAP_ABOVE, COLORS.ink, 0.8)
  y -= 2
  drawText(page, "Sum", col("number"), y, {
    font: fonts.semibold,
    size: 10,
    color: COLORS.ink,
  })
  drawText(
    page,
    formatAmount(totalCents / 100),
    colRight("payout"),
    y,
    {
      font: fonts.semibold,
      size: 10.5,
      color: COLORS.ink,
    },
    "right",
  )

  // --- Receipt pages --------------------------------------------------------------------------
  for (const row of rows) {
    const sources = await receiptSources(doc, row)
    for (const [i, source] of sources.entries()) {
      drawReceiptPage(newPage(), row, rows.length, source, i, sources.length, {
        payoutCurrency,
        style,
        fonts,
      })
    }
  }

  // --- Footer on every page -------------------------------------------------------------------
  const pages = doc.getPages()
  for (const [i, p] of pages.entries()) {
    hairline(p, FOOTER_Y + 13, COLORS.rule, 0.5)
    drawText(
      p,
      `Utleggsrapport ${input.reportId}`,
      MARGIN_X,
      FOOTER_Y,
      style.footer,
    )
    drawText(
      p,
      `Side ${i + 1} av ${pages.length}`,
      PAGE_WIDTH - MARGIN_X,
      FOOTER_Y,
      style.footer,
      "right",
    )
  }

  return doc.save()
}

// ---------------------------------------------------------------------------------------------
// Receipts: every page of a PDF receipt, or the image, placed on its own A4 page under a header.

type ReceiptSource =
  | { kind: "page"; page: PDFEmbeddedPage; rotation: number }
  | { kind: "image"; image: PDFImage }

async function receiptSources(
  doc: PDFDocumentType,
  row: ReportRow,
): Promise<ReceiptSource[]> {
  const file = row.attachment
  try {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      const source = await PDFDocument.load(await file.arrayBuffer())
      const pages = source.getPages()
      const boxes = pages.map((p) => {
        const box = p.getCropBox()
        return {
          left: box.x,
          bottom: box.y,
          right: box.x + box.width,
          top: box.y + box.height,
        }
      })
      const embedded = await doc.embedPages(pages, boxes)
      return embedded.map((page, i) => ({
        kind: "page",
        page,
        rotation: (((pages[i]?.getRotation().angle ?? 0) % 360) + 360) % 360,
      }))
    }
    const { bytes, type } = await embeddableImage(file)
    const image =
      type === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    return [{ kind: "image", image }]
  } catch (error) {
    throw new ReceiptError(row.n, error)
  }
}

/** The receipt for expense `n` couldn't be read (an encrypted PDF, an unknown image type). */
export class ReceiptError extends Error {
  constructor(
    readonly receipt: number,
    cause: unknown,
  ) {
    super(`Kunne ikke lese vedlegget til kvittering ${receipt}`, { cause })
    this.name = "ReceiptError"
  }
}

async function embeddableImage(
  file: File,
): Promise<{ bytes: ArrayBuffer; type: "png" | "jpg" }> {
  if (file.type === "image/png")
    return { bytes: await file.arrayBuffer(), type: "png" }
  if (file.type === "image/jpeg")
    return { bytes: await file.arrayBuffer(), type: "jpg" }
  // WebP, GIF and the like: re-encode in the browser.
  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  )
    throw new Error(`Bildeformatet ${file.type || "(ukjent)"} støttes ikke`)
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  )
  if (!blob) throw new Error("Kunne ikke konvertere bildet")
  return { bytes: await blob.arrayBuffer(), type: "jpg" }
}

function drawReceiptPage(
  page: PDFPage,
  row: ReportRow,
  receiptCount: number,
  source: ReceiptSource,
  index: number,
  sourceCount: number,
  ctx: {
    payoutCurrency: string
    fonts: Fonts
    style: Record<"label" | "small" | "pill" | "value" | "subtitle", TextStyle>
  },
) {
  const { fonts, style } = ctx
  let y = PAGE_HEIGHT - MARGIN_TOP - 8

  const headingStyle = { font: fonts.display, size: 13.5, color: COLORS.ink }
  const heading = `Kvittering ${row.n} av ${receiptCount}`
  const headingWidth = drawText(page, heading, MARGIN_X, y, headingStyle)
  if (sourceCount > 1)
    drawText(
      page,
      `side ${index + 1} av ${sourceCount}`,
      MARGIN_X + headingWidth + 10,
      y,
      { ...style.subtitle, size: 9.5 },
    )
  drawPill(
    page,
    row.category,
    PAGE_WIDTH - MARGIN_X,
    y + 1,
    style.pill,
    "right",
  )

  y -= 19
  const descriptionStyle = {
    font: fonts.regular,
    size: 10.5,
    color: COLORS.ink,
  }
  for (const line of wrap(row.description, CONTENT_WIDTH, descriptionStyle)) {
    drawText(page, line, MARGIN_X, y, descriptionStyle)
    y -= 14
  }

  y -= 1
  const original = `${formatAmount(row.original.amount)} ${row.original.currency}`
  const facts = [formatDate(row.date), original]
  if (row.conversion) {
    facts.push(
      `${formatAmount((row.payoutCents ?? 0) / 100)} ${ctx.payoutCurrency}`,
      `kurs ${formatExchangeRate(row.conversion.rate, row.conversion.unitMultiplier)} (Norges Bank ${formatDate(row.conversion.rateDate)})`,
    )
  } else if (row.payoutCents === undefined) {
    facts.push("kurs mangler")
  }
  drawText(page, facts.join("  ·  "), MARGIN_X, y, {
    ...style.subtitle,
    size: 9,
  })
  y -= 12
  hairline(page, y)

  // The receipt itself, scaled to fit below the header and centred.
  const frameTop = y - 16
  const frameBottom = CONTENT_BOTTOM + 4
  const frameHeight = frameTop - frameBottom
  const sideways =
    source.kind === "page" &&
    (source.rotation === 90 || source.rotation === 270)
  const natural =
    source.kind === "page"
      ? { width: source.page.width, height: source.page.height }
      : { width: source.image.width, height: source.image.height }
  const shown = sideways
    ? { width: natural.height, height: natural.width }
    : natural
  const fit = Math.min(CONTENT_WIDTH / shown.width, frameHeight / shown.height)
  // A PDF page is never enlarged; an image fills the space it has.
  const scale = source.kind === "page" ? Math.min(1, fit) : fit
  const width = shown.width * scale
  const height = shown.height * scale
  const x = MARGIN_X + (CONTENT_WIDTH - width) / 2
  const bottom = frameTop - height

  if (source.kind === "image") {
    page.drawImage(source.image, { x, y: bottom, width, height })
  } else {
    // Undo the page's /Rotate, which an embedded page doesn't carry with it.
    const w = natural.width * scale
    const h = natural.height * scale
    const placement =
      source.rotation === 90
        ? { x, y: bottom + w, rotate: degrees(-90) }
        : source.rotation === 180
          ? { x: x + w, y: bottom + h, rotate: degrees(180) }
          : source.rotation === 270
            ? { x: x + h, y: bottom, rotate: degrees(90) }
            : { x, y: bottom, rotate: degrees(0) }
    page.drawPage(source.page, { ...placement, xScale: scale, yScale: scale })
  }
  page.drawRectangle({
    x,
    y: bottom,
    width,
    height,
    borderColor: COLORS.rule,
    borderWidth: 0.6,
  })
}
