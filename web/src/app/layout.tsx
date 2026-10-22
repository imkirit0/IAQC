import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

// IBM Plex Sans: a sober corporate face with true tabular figures for scores and dates.
const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "IAQC — Internal Audit & Quality Control", template: "%s · IAQC" },
  description: "Internal Audit and Quality Control of Centres",
};

// Resolve the theme before first paint: saved choice, else the OS preference.
const THEME_SCRIPT = `(function(){var p="system";try{p=localStorage.getItem("rds-theme")||"system"}catch(e){}var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.dataset.theme=d?"dark":"light";e.dataset.themePref=p})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
