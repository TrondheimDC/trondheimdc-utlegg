import { z } from "zod"
import {
  getBankCountryType,
  validateABARoutingNumber,
  validateBIC,
  validateIBAN,
  validateNorwegianBBAN,
} from "@/lib/banking"

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
