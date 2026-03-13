import "../styles/globals.css"
import { AppType } from "next/app"
import Head from "next/head"
import { I18nextProvider } from "react-i18next"
import { Menu } from "@/components/Menu"
import i18n from "@/i18n"

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <I18nextProvider i18n={i18n}>
      <Head>
        <meta charSet="UTF-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/icon" href="/img/favicon.ico" />
      </Head>
      <Menu />
      <Component {...pageProps} />
    </I18nextProvider>
  )
}

export default MyApp
