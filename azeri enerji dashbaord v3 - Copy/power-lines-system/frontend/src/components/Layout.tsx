import React, { useEffect, useMemo, useState } from "react";
import { Moon, Sun, User } from "lucide-react";
import {
  IconLayoutDashboard,
  IconTarget,
  IconListNumbers,
  IconMap2,
  IconClipboardList,
  IconSettings,
  IconDrone,
} from "@tabler/icons-react";
import { ToastContainer, useToast } from "./Toast";
import { ThemeProvider, type Theme } from "../context/ThemeContext";
import { LanguageProvider, createTranslator, createParamTranslator, createProgressLabelTranslator } from "../context/LanguageContext";
import { type Language } from "../i18n/translations";
import { FloatingDock, type FloatingDockItem } from "./ui/floating-dock";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : "dark";
}

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem("language");
  return stored === "en" || stored === "az" ? stored : "en";
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { toasts, remove } = useToast();
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [language, setLanguage] = useState<Language>(readStoredLanguage);
  const t = useMemo(() => createTranslator(language), [language]);
  const tp = useMemo(() => createParamTranslator(language), [language]);
  const tLabel = useMemo(() => createProgressLabelTranslator(language), [language]);

  const dockItems = useMemo<FloatingDockItem[]>(
    () => [
      {
        title: t("nav.dashboard"),
        href: "/dashboard",
        end: true,
        icon: <IconLayoutDashboard stroke={1.5} className="size-[22px]" />,
      },
      {
        title: t("nav.aiDetection"),
        href: "/ai-detection",
        icon: <IconTarget stroke={1.5} className="size-[22px]" />,
      },
      {
        title: t("nav.liveDroneFeed"),
        href: "/live-drone-feed",
        icon: <IconDrone stroke={1.5} className="size-[22px]" />,
      },
      {
        title: t("nav.recentUploads"),
        href: "/runs",
        icon: <IconListNumbers stroke={1.5} className="size-[22px]" />,
      },
      {
        title: t("nav.corridorMap"),
        href: "/map",
        icon: <IconMap2 stroke={1.5} className="size-[22px]" />,
      },
      {
        title: t("nav.reviewQueue"),
        href: "/review-queue",
        icon: <IconClipboardList stroke={1.5} className="size-[22px]" />,
      },
      {
        title: t("nav.settings"),
        href: "/settings",
        icon: <IconSettings stroke={1.5} className="size-[22px]" />,
      },
    ],
    [t]
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
    localStorage.setItem("language", language);
  }, [language]);

  const logoSrc =
    theme === "light" ? encodeURI("/logo-1.png") : "/logo-2.png";

  return (
    <ThemeProvider value={{ theme, setTheme }}>
    <LanguageProvider value={{ language, setLanguage, t, tp, tLabel }}>
    <div
      className="min-h-screen relative overflow-x-hidden transition-[background-color,color] duration-200"
      style={{ backgroundColor: "var(--layout-bg)", color: "var(--layout-text)" }}
    >
      <ToastContainer toasts={toasts} onRemove={remove} />

      {/* ── Header ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 h-20 flex items-center justify-between px-5 md:px-8 backdrop-blur-md border-b transition-[background-color,border-color] duration-200"
        style={{
          backgroundColor: "var(--header-bg)",
          borderBottomColor: "var(--header-border)",
        }}
      >

        {/* Left — Logo */}
        <div className="flex items-center h-full py-1">
          <div className="flex items-center h-[78px] shrink-0 w-[min(62vw,540px)] md:w-[580px] pl-1 pr-2">
            <img
              src={logoSrc}
              alt="AzərEnerji"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "left center",
              }}
              className="block"
            />
          </div>
        </div>

        {/* Right — Language + Theme + User */}
        <div className="flex items-center gap-3">

          {/* Language: EN | AZ */}
          <div
            className="inline-flex h-9 shrink-0 items-center rounded-full border p-1 gap-0.5"
            style={{
              backgroundColor: "var(--theme-toggle-bg)",
              borderColor: "var(--theme-toggle-border)",
            }}
            role="group"
            aria-label={t("header.language")}
          >
            <button
              type="button"
              onClick={() => setLanguage("en")}
              aria-pressed={language === "en"}
              aria-label={t("header.english")}
              title={t("header.english")}
              className={`flex h-7 min-w-[2rem] items-center justify-center rounded-full px-2 text-[11px] font-bold tracking-wide transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--layout-bg)] ${
                language === "az" ? "opacity-60 hover:opacity-100" : ""
              }`}
              style={
                language === "en"
                  ? {
                      backgroundColor: "var(--theme-segment-active-bg)",
                      color: "var(--theme-segment-active-fg)",
                      boxShadow: "var(--theme-segment-active-shadow)",
                    }
                  : { color: "var(--theme-segment-muted)" }
              }
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage("az")}
              aria-pressed={language === "az"}
              aria-label={t("header.azerbaijani")}
              title={t("header.azerbaijani")}
              className={`flex h-7 min-w-[2rem] items-center justify-center rounded-full px-2 text-[11px] font-bold tracking-wide transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--layout-bg)] ${
                language === "en" ? "opacity-60 hover:opacity-100" : ""
              }`}
              style={
                language === "az"
                  ? {
                      backgroundColor: "var(--theme-segment-active-bg)",
                      color: "var(--theme-segment-active-fg)",
                      boxShadow: "var(--theme-segment-active-shadow)",
                    }
                  : { color: "var(--theme-segment-muted)" }
              }
            >
              AZ
            </button>
          </div>

          {/* Theme: segmented toggle (Lucide Sun / Moon) */}
          <div
            className="inline-flex h-9 shrink-0 items-center rounded-full border p-1 gap-0.5"
            style={{
              backgroundColor: "var(--theme-toggle-bg)",
              borderColor: "var(--theme-toggle-border)",
            }}
            role="group"
            aria-label={t("header.colorTheme")}
          >
            <button
              type="button"
              onClick={() => setTheme("light")}
              aria-pressed={theme === "light"}
              aria-label={t("header.lightTheme")}
              title={t("header.lightTheme")}
              className={`flex size-7 items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--layout-bg)] ${
                theme === "dark" ? "opacity-60 hover:opacity-100" : ""
              }`}
              style={
                theme === "light"
                  ? {
                      backgroundColor: "var(--theme-segment-active-bg)",
                      color: "var(--theme-segment-active-fg)",
                      boxShadow: "var(--theme-segment-active-shadow)",
                    }
                  : { color: "var(--theme-segment-muted)" }
              }
            >
              <Sun className="size-4" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              aria-pressed={theme === "dark"}
              aria-label={t("header.darkTheme")}
              title={t("header.darkTheme")}
              className={`flex size-7 items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--layout-bg)] ${
                theme === "light" ? "opacity-60 hover:opacity-100" : ""
              }`}
              style={
                theme === "dark"
                  ? {
                      backgroundColor: "var(--theme-segment-active-bg)",
                      color: "var(--theme-segment-active-fg)",
                      boxShadow: "var(--theme-segment-active-shadow)",
                    }
                  : { color: "var(--theme-segment-muted)" }
              }
            >
              <Moon className="size-4" strokeWidth={2} aria-hidden />
            </button>
          </div>

          {/* Divider */}
          <div
            className="hidden sm:block w-px h-5 transition-colors duration-200"
            style={{ backgroundColor: "var(--divider)" }}
          />

          {/* User chip */}
          <div className="hidden sm:flex items-center gap-2.5 cursor-pointer group">
            <div
              className="w-8 h-8 rounded-full border flex items-center justify-center transition-colors group-hover:[border-color:var(--user-chip-border-hover)]"
              style={{
                background: `linear-gradient(to bottom right, var(--user-chip-from), var(--user-chip-to))`,
                borderColor: "var(--user-chip-border)",
                color: "var(--user-chip-icon)",
              }}
            >
              <User size={15} />
            </div>
            <span
              className="text-sm max-w-[96px] truncate transition-colors group-hover:[color:var(--user-text-hover)]"
              style={{ color: "var(--user-text)" }}
            >
              {t("header.user")}
            </span>
          </div>
        </div>
      </header>

      <FloatingDock items={dockItems} />

      <main className="pt-20 min-h-screen pb-28 md:pb-32">
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </div>
    </LanguageProvider>
    </ThemeProvider>
  );
}