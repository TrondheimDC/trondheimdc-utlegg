import Head from "next/head"
import { useTranslation } from "react-i18next"

const NotFound = () => {
  const { t } = useTranslation("common")

  return (
    <>
      <Head>
        <title>{t("main.title")}</title>
        <meta name="description" content={t("main.title")!} />
      </Head>
      <div className="container">
        <div style={{ padding: "60px" }}></div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <h1
            style={{
              borderRight: "2px solid",
              paddingRight: "15px",
            }}
          >
            404
          </h1>
          <h3
            style={{
              paddingLeft: "15px",
            }}
          >
            {t("notFound")}
          </h3>
        </div>
      </div>
    </>
  )
}

export default NotFound
