import type { Metadata } from "next"
import Script from "next/script"
import "./globals.css"

import { getAppBranding } from "@/lib/branding"

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getAppBranding()
  const appName = branding.appName
  const iconUrl = branding.faviconUrl ? "/favicon" : "/favicon.ico"
  const icons = {
    icon: [{ url: iconUrl }],
    apple: [{ url: iconUrl }],
  }

  return {
    title: appName,
    description: "Plataforma de ranking e desafios do Tenis TCC.",
    manifest: "/manifest.webmanifest",
    themeColor: "#0b1218",
    icons,
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeScript = `
    (function () {
      try {
        var stored = localStorage.getItem("theme");
        var theme = stored ? stored : "dark";
        if (theme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      } catch (e) {}
    })();
  `

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <link rel="icon" href="/favicon" />
        <link rel="apple-touch-icon" href="/favicon" />
      </head>
      <body
        className="min-h-screen bg-background text-foreground antialiased font-sans"
      >
        {children}
      </body>
    </html>
  );
}
