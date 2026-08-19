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
