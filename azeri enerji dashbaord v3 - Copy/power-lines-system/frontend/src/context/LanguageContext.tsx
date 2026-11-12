import React, { createContext, useContext } from "react";
import {
  type Language,
  type TranslationKey,
  translate,
  translateWithParams,
  translateProgressLabel,
} from "../i18n/translations";

type LanguageContextValue = {
  language: Language;
  setLanguage: React.Dispatch<React.SetStateAction<Language>>;
  t: (key: TranslationKey) => string;
  tp: (key: TranslationKey, params: Record<string, string | number>) => string;
  tLabel: (label: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: LanguageContextValue;
}) {
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}

export function createTranslator(language: Language) {
  return (key: TranslationKey) => translate(language, key);
}

export function createParamTranslator(language: Language) {
  return (key: TranslationKey, params: Record<string, string | number>) =>
    translateWithParams(language, key, params);
}

export function createProgressLabelTranslator(language: Language) {
  return (label: string) => translateProgressLabel(language, label);
}
