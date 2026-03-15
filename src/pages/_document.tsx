import Document, { Head, Html, Main, NextScript } from "next/document"
import nextI18nextConfig from "../../next-i18next.config.mjs"

class CustomDocument extends Document {
  render() {
    const currentLocale =
      this.props.__NEXT_DATA__.locale ?? nextI18nextConfig.i18n.defaultLocale
    return (
      <Html lang={currentLocale}>
        <Head />
        <body >
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default CustomDocument
