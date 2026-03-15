"use client"

import { ThemeToggle } from "./ThemeToggle"

export const Footer = () => {
  return (
    <footer className="border-t border-border bg-card dark:bg-sidebar py-4">
      <div className="container mx-auto px-4 sm:px-6 flex items-center justify-between">
        <ThemeToggle />
        <p className="text-sm text-muted-foreground">© 2026 TrondheimDC</p>
      </div>
    </footer>
  )
}