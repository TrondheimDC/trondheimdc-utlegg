"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "./ui/button"

export const Menu = () => {
  const { i18n, t } = useTranslation("common", { keyPrefix: "menu" })
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const themeValue = mounted ? (theme ?? "system") : "system"

  const handleLanguageChange = (lang: "no" | "en") => {
    if (i18n.language !== lang) {
      void i18n.changeLanguage(lang)
    }
  }

  const triggerIcon =
    !mounted || (resolvedTheme ?? "light") === "light" ? (
      <Sun className="size-4" />
    ) : (
      <Moon className="size-4" />
    )

  return (
    <nav
      id="navbar"
      className="fixed left-0 right-0 top-0 z-[49] h-[58.22px] w-full border-b border-transparent bg-[#292929] backdrop-blur-md transition-[background-color]"
    >
      <div className="flex h-full w-full items-center justify-between px-[29px] py-[8px]">
        <Link href="/" className="flex items-center">
          <Image
            src="/img/logos/TDC_white.svg"
            alt="TrondheimDC"
            width={74}
            height={30}
            priority
          />
        </Link>

        <div className="flex items-center gap-1">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => handleLanguageChange("no")}
              className="group relative p-2 font-['system-ui',_Arial,_sans-serif] text-base text-[#fff] transition-colors duration-300 hover:text-[#ea7564]"
            >
              NO
              <span className="absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-[#ea7564] transition-transform duration-300 group-hover:scale-x-100" />
            </button>
            <button
              type="button"
              onClick={() => handleLanguageChange("en")}
              className="group relative p-2 font-['system-ui',_Arial,_sans-serif] text-base text-[#fff] transition-colors duration-300 hover:text-[#ea7564]"
            >
              EN
              <span className="absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-[#ea7564] transition-transform duration-300 group-hover:scale-x-100" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
