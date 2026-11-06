// Writes sample utleggsrapporter to samples/ with the real generatePDF, so the layout can be
// reviewed and trondheimdc-regnskap can test its parser against the PDFs the form makes.
//
//   pnpm samples
//
// Ids, dates and exchange rates are fixed, so the output only changes when the layout does.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { deflateSync } from "node:zlib"
import { degrees, PDFDocument, StandardFonts } from "pdf-lib"
import type { ConversionResult } from "@/lib/exchange-rates"
import type { ExpenseCategoryId } from "@/lib/expense-categories"
import { type GeneratePdfInput, generatePDF } from "@/lib/pdf"
import { reportFilename } from "@/lib/report-naming"

const root = join(import.meta.dirname, "..")
const outDir = join(root, "samples")
const font = (file: string) =>
  readFileSync(join(root, "public/fonts", file)).buffer as ArrayBuffer
const fonts = {
  regular: font("IBMPlexSans-Regular.ttf"),
  semibold: font("IBMPlexSans-SemiBold.ttf"),
  display: font("SpaceGrotesk-Bold.ttf"),
}

// Norges Bank-like rates, NOK per unit.
const NOK_PER: Record<string, number> = {
  NOK: 1,
  EUR: 11.735,
  USD: 10.912,
  SEK: 1.0123,
}
async function fixedRates(
  amount: number,
  from: string,
  to: string,
  date: Date,
): Promise<ConversionResult | null> {
  const a = NOK_PER[from]
  const b = NOK_PER[to]
  if (!a || !b) return null
  const rate = a / b
  const rateDate = new Date(date)
  rateDate.setDate(rateDate.getDate() - 1)
  return {
    amount: Math.round(amount * rate * 100) / 100,
    rate,
    rateDate,
    unitMultiplier: 1,
    sourceCurrency: from,
    targetCurrency: to,
  }
}

/** A receipt PDF with a text layer, like one from a web shop. */
async function pdfReceipt(
  lines: string[],
  opts: { rotate?: number; size?: [number, number] } = {},
) {
  const doc = await PDFDocument.create()
  const page = doc.addPage(opts.size ?? [420, 595])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  lines.forEach((line, i) => {
    page.drawText(line, {
      x: 40,
      y: page.getHeight() - 60 - i * 18,
      size: i === 0 ? 16 : 11,
      font: i === 0 ? bold : font,
    })
  })
  if (opts.rotate) page.setRotation(degrees(opts.rotate))
  return new File([await doc.save()], "kvittering.pdf", {
    type: "application/pdf",
  })
}

/** A PNG "photo" of a receipt: a paper slip with lines of print on a grey table. */
function photoReceipt(width = 900, height = 1400): File {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x++) {
      const onPaper = x > 150 && x < 750 && y > 100 && y < 1300
      const printLine =
        onPaper &&
        y > 200 &&
        y < 1100 &&
        (y - 200) % 60 < 14 &&
        x > 210 &&
        x < 210 + ((y * 7) % 420) + 60
      const v = printLine ? 60 : onPaper ? 248 : 150 + ((x + y) % 7)
      raw[row + 1 + x * 3] = v
      raw[row + 2 + x * 3] = v
      raw[row + 3 + x * 3] = printLine ? 60 : onPaper ? 244 : 140
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
  return new File([png], "kvittering.png", { type: "image/png" })
}

function crc32(data: Buffer): number {
  let crc = ~0
  for (const byte of data) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

type Expense = GeneratePdfInput["expenses"][number]
const expense = (
  description: string,
  category: ExpenseCategoryId,
  amount: number,
  currency: string,
  date: string,
  attachment: File,
): Expense => ({
  description,
  category,
  amount,
  currency,
  date: new Date(`${date}T12:00:00`),
  attachment,
})

const person = {
  streetAddress: "Kongens gate 15",
  postalCode: "7011",
  city: "Trondheim",
  country: "Norway",
  countryDisplayName: "Norge",
  residesInNorway: true,
  bankCountry: "",
  bankCountryIso2: "",
  bankIban: "",
  bankRoutingNumber: "",
  bankAccountNumber: "12345678903",
  bankAccountType: "checking" as const,
  bankSwiftBic: "",
  bankName: "",
  bankAddress: "",
  bankAccountHolderName: "",
  skipBankValidation: false,
  targetCurrency: "NOK",
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const generatedAt = new Date("2026-11-06T14:30:00")
  const pizza = await pdfReceipt([
    "Peppes Pizza Solsiden",
    "12 x Stor pizza",
    "Sum 2 450,50",
    "Herav MVA 15% 319,63",
  ])
  const tape = await pdfReceipt([
    "Clas Ohlson",
    "Teip, kabelstrips",
    "Totalt 389,00",
    "Herav mva 25% 77,80",
  ])
  const meetup = await pdfReceipt(
    ["Meetup Pro", "Organizer subscription, 6 months", "Total USD 89.94"],
    {
      rotate: 90,
      size: [595, 420],
    },
  )

  const samples: (GeneratePdfInput & { file: string })[] = [
    {
      file: "norsk-konto",
      ...person,
      name: "Øystein Åsmund Ærlig",
      email: "oystein@example.com",
      reportId: "UT-20261106-7KQ2",
      expenses: [
        expense(
          "Pizza til crew under rigging fredag kveld, 12 store pizza fra Peppes Solsiden",
          "servering",
          2450.5,
          "NOK",
          "2026-10-09",
          pizza,
        ),
        expense(
          "Teip og kabelstrips til scenen",
          "materiell",
          389,
          "NOK",
          "2026-10-09",
          tape,
        ),
        expense(
          "Taxi Værnes – Trondheim S for taler",
          "reise",
          512,
          "NOK",
          "2026-10-10",
          photoReceipt(),
        ),
        expense(
          "Meetup.com-abonnement for Trondheim JS, 6 mnd",
          "meetup-stotte",
          89.94,
          "USD",
          "2026-10-01",
          meetup,
        ),
      ],
    },
    {
      file: "iban-eur",
      ...person,
      name: "Łukasz Wójcik",
      email: "lukasz@example.com",
      residesInNorway: false,
      country: "DEU",
      countryDisplayName: "Tyskland",
      streetAddress: "Schönhauser Allee 12",
      postalCode: "10119",
      city: "Berlin",
      bankCountryIso2: "DE",
      bankCountryDisplayName: "Tyskland",
      bankIban: "DE89370400440532013000",
      bankSwiftBic: "COBADEFFXXX",
      bankAccountNumber: "",
      targetCurrency: "EUR",
      reportId: "UT-20261106-M3VD",
      expenses: [
        expense(
          "Flight Berlin–Trondheim for speaker",
          "reise",
          189.9,
          "EUR",
          "2026-10-07",
          await pdfReceipt([
            "Norwegian Air Shuttle",
            "BER-TRD",
            "Total EUR 189.90",
          ]),
        ),
        expense(
          "Hotel Scandic Nidelven, 2 nights",
          "overnatting",
          3120,
          "NOK",
          "2026-10-09",
          await pdfReceipt([
            "Scandic Nidelven",
            "2 netter",
            "Sum 3 120,00",
            "MVA 12% 334,29",
          ]),
        ),
      ],
    },
    {
      file: "us-uvalidert",
      ...person,
      name: "Ștefan Ionescu 李小龙",
      email: "stefan@example.com",
      residesInNorway: false,
      country: "USA",
      countryDisplayName: "USA",
      streetAddress:
        "500 Market Street, Apartment 12B, Building North Entrance",
      postalCode: "94105",
      city: "San Francisco, CA",
      bankCountryIso2: "US",
      bankCountryDisplayName: "USA",
      bankRoutingNumber: "021000021",
      bankAccountNumber: "12345678901",
      bankSwiftBic: "CHASUS33",
      bankName: "JPMorgan Chase Bank",
      bankAddress: "270 Park Avenue, New York, NY 10017",
      bankAccountHolderName: "Stefan Ionescu",
      skipBankValidation: true,
      validationSkipped: true,
      targetCurrency: "USD",
      reportId: "UT-20261106-QX4B",
      expenses: [
        expense(
          "Speaker dinner at To Rom og Kjøkken",
          "servering",
          4200,
          "NOK",
          "2026-10-10",
          photoReceipt(1200, 900),
        ),
      ],
    },
    {
      file: "lang-rapport",
      ...person,
      name: "Kari Nordmann",
      email: "kari@example.com",
      reportId: "UT-20261106-9PZT",
      expenses: Array.from({ length: 32 }, (_, i) => {
        const kinds: [string, ExpenseCategoryId][] = [
          ["Kaffe og kaker til meetup", "servering"],
          ["Bussbillett", "reise"],
          [
            "Pizza og brus til frivillige etter opprigg, Dominos Lade",
            "servering",
          ],
          ["Batterier til mikrofoner (AA, 24 stk) og gaffateip", "materiell"],
          ["Domene trondheimdc.no, fornyelse", "programvare"],
          ["T-skjorter til frivillige, 30 stk", "materiell"],
          ["Pizza og lokale til Trondheim JS-meetup", "meetup-stotte"],
        ]
        const [text, category] = kinds[i % kinds.length] as [
          string,
          ExpenseCategoryId,
        ]
        return expense(
          text,
          category,
          99 + i * 37.5,
          i % 7 === 3 ? "SEK" : "NOK",
          `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
          photoReceipt(300, 450),
        )
      }),
    },
  ]

  for (const { file, ...input } of samples) {
    const bytes = await generatePDF({
      ...input,
      generatedAt,
      fonts,
      convert: fixedRates,
    })
    const path = join(outDir, `${file}.pdf`)
    writeFileSync(path, bytes)
    console.log(
      `${path}  (${reportFilename(input.reportId, input.name)}, ${(bytes.length / 1024).toFixed(0)} KB)`,
    )
  }
}

await main()
