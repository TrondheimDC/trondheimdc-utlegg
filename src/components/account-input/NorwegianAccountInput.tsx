import React from "react"
import { NumberFormatBase } from "react-number-format"
import { banks } from "@/data/NorwegianBanks"
import {
  formatNorwegianBBANForDisplay,
  validateNorwegianBBAN,
} from "@/lib/banking"
import { BankLogo } from "./BankLogo"
import type { AccountInputBaseProps, AccountValidationResult } from "./types"

const NORWEGIAN_BBAN_LENGTH = 11

function bbanRemoveFormatting(value: string) {
  return value.replace(/\s+/g, "").replace(/\D/g, "")
}

function bbanIsValidInputCharacter(char: string) {
  return /^[0-9]$/.test(char)
}

function bbanGetCaretBoundary(value: string) {
  return Array.from({ length: value.length + 1 }, () => true)
}

/** Norwegian BBAN-only input: 11 digits, mask XXXX XX XXXXX, bank logo, no IBAN */
export const NorwegianAccountInput = React.forwardRef<
  HTMLInputElement,
  AccountInputBaseProps & {
    value: string
    onChange: (value: string) => void
    onBlur: () => void
    onValidationChange?: (result: AccountValidationResult) => void
  }
>(function NorwegianAccountInput(
  {
    value,
    onChange,
    onBlur,
    onValidationChange,
    defaultValue: _defaultValue,
    ...props
  },
  ref,
) {
  const rawDigits = (value || "").replace(/\D/g, "")

  const bank = React.useMemo(() => {
    return (
      banks.find((b) => b.clearingCodes.includes(rawDigits.slice(0, 4))) || null
    )
  }, [rawDigits])

  const validate = React.useCallback(
    (digits: string): AccountValidationResult => {
      if (!digits) return { isValid: true }
      if (digits.length !== NORWEGIAN_BBAN_LENGTH) {
        return {
          isValid: false,
          errorType: "length",
          expectedLength: NORWEGIAN_BBAN_LENGTH,
          actualLength: digits.length,
        }
      }
      if (!validateNorwegianBBAN(digits)) {
        return { isValid: false, errorType: "format" }
      }
      return { isValid: true }
    },
    [],
  )

  return (
    <div className="relative w-full">
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 z-1 -translate-y-1/2">
          <BankLogo bank={bank} />
        </div>
        <NumberFormatBase
          {...props}
          getInputRef={ref}
          value={rawDigits}
          format={formatNorwegianBBANForDisplay}
          removeFormatting={bbanRemoveFormatting}
          isValidInputCharacter={bbanIsValidInputCharacter}
          getCaretBoundary={bbanGetCaretBoundary}
          onValueChange={(values) => onChange(values.value)}
          onBlur={() => {
            onBlur()
            if (rawDigits) {
              onValidationChange?.(validate(rawDigits))
            }
          }}
          type="text"
          inputMode="numeric"
          placeholder={
            (props.placeholder as string | undefined) ?? "e.g. 8601 11 17947"
          }
          className="flex h-9 w-full rounded-md border border-input bg-transparent py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 pl-10"
          style={{ paddingLeft: "3rem" }}
        />
      </div>
      {bank?.name && (
        <p className="mt-2 text-sm text-muted-foreground">{bank.name}</p>
      )}
    </div>
  )
})
