import "../styles/index.css"
import { AppType } from "next/app"
import Head from "next/head"
import { ThemeProvider } from "next-themes"
import { I18nextProvider } from "react-i18next"
import { Footer } from "@/components/Footer"
import { Menu } from "@/components/Menu"
import i18n from "@/i18n"

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider attribute="class">
        <Head>
          <meta charSet="UTF-8" />
          <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" type="image/icon" href="/img/favicon.ico" />
        </Head>
        <Menu />
        <Component {...pageProps} />
        <Footer />
      </ThemeProvider>
    </I18nextProvider>
  )
}

export default MyApp
