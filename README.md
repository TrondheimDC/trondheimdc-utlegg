# TrondheimDC

## Tech stack

- **Framework:** Next.js (Pages Router, static export via `output: "export"`)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + Shadcn UI
- **i18n:** next-i18next (Norwegian / English)
- **Package manager:** pnpm

**Requirements:** Node.js ≥ 25.

## Getting started

### With Mise

```bash
mise install   # install Node (and use project tools)
mise run install
mise run dev   # or: mise dev
```

Open [http://localhost:3000](http://localhost:3000).

**Tasks:** `mise run install` | `mise run dev` | `mise run build` | `mise run start`

### Without Mise

Install Node and pnpm

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## IBAN validation

IBAN handling (validation, composition, country specs) uses [ibantools](https://github.com/Simplify/ibantools). As of February 2026, ibantools has not been updated to SWIFT IBAN Registry Release 101 (December 2025). Track upstream progress and update the dependency when a new version ships.

## The PDF

The report PDF is read by trondheimdc-regnskap, so its layout is a contract: see
[docs/pdf-format.md](docs/pdf-format.md). `pnpm samples` writes sample reports to `samples/`
with the real generator, to review the layout and to use as test data in regnskap.

## Query parameters

The form can be sent prefilled, and the link can limit what it offers. Put the parameters after
the form's address, for example `https://<skjema>/?for=speaker`. `<skjema>` is the address the
form is published at.

| Parameter | Values | What it does |
|---|---|---|
| `for` | `speaker`, `meetup`, `forening` | Shows only the categories for that group. Without it, all categories are shown, under headings. |
| `category` | `reise`, `overnatting`, `servering`, `materiell`, `programvare`, `meetup-stotte`, `annet` | Locks the category. The form doesn't ask, and every receipt gets it. |
| `lang` | `no`, `en` | Language of the form. |
| `name`, `email`, `streetAddress`, `postalCode`, `city`, `country`, … | Any text | Fills in that field. Same names as in the form. |

`for` and `category` only hide or fill in choices. Regnskap checks every category anyway. A link
with a field in it (for example `?name=…`) wins over the details remembered in the browser. `for`,
`category` and `lang` don't count as a field, so they don't replace them.

### Examples

**Foredragsholder (speaker):** travel and accommodation, plus Annet.

```
https://<skjema>/?for=speaker
```

Shows: Reise og transport, Overnatting, Annet.

**Meetup-støtte:** the category is locked, so the form only asks for the usual details, and the
description says which meetup got the support.

```
https://<skjema>/?for=meetup
```

Same as `?category=meetup-stotte`. Shows no category question.

**Foreningen:** the association's own costs. Food at meetings, material and equipment, software and
subscriptions for TDC, and travel and Annet.

```
https://<skjema>/?for=forening
```

Shows: Mat og servering, Materiell og utstyr, Programvare og abonnement, Reise og transport,
Overnatting, Annet.

**Everything, with headings:** no `for`.

```
https://<skjema>/
```

Shows: Foredragsholder, Foreningen and Meetups, with Annet at the bottom.

**Prefilled for a speaker:** a `lang` and a locked category, for a link in an e-mail:

```
https://<skjema>/?lang=en&category=reise
```

### Where the groups are

The groups live in `categoryGroups()` in `src/lib/expense-categories.ts`. The category ids and the
PDF labels are part of the contract with trondheimdc-regnskap; see `docs/pdf-format.md`.
