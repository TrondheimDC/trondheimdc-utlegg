import i18n from "i18next"
import { initReactI18next } from "react-i18next"

// Import translation resources directly. These are bundled at build time.
import noCommon from "../public/locales/no/common.json"
import enCommon from "../public/locales/en/common.json"

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      no: { common: noCommon },
      en: { common: enCommon },
    },
    lng: "no",
    fallbackLng: "no",
    supportedLngs: ["no", "en"],
    ns: ["common"],
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
  })
}

export default i18n

