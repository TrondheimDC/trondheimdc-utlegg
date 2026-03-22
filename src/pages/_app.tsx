import "../styles/index.css"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AppType } from "next/app"
import Head from "next/head"
import { ThemeProvider } from "next-themes"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { Footer } from "@/components/Footer"
import { Menu } from "@/components/Menu"
import i18n from "@/i18n"

const MyApp: AppType = ({ Component, pageProps }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider attribute="class">
          <Head>
            <meta charSet="UTF-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
            <link rel="icon" type="image/icon" href="/img/favicon.ico" />
          </Head>
          <Menu />
          <Component {...pageProps} />
          <Footer />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

export default MyApp
