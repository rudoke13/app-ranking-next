import type { Metadata, Viewport } from "next"
import Script from "next/script"
import "./globals.css"

import { getAppBranding } from "@/lib/branding"

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getAppBranding()
  const appName = branding.appName
  const iconUrl = branding.faviconUrl ?? branding.logoUrl ? "/favicon" : "/default-favicon.ico"
  const icons = {
    icon: [{ url: iconUrl }],
    shortcut: [{ url: iconUrl }],
    apple: [{ url: iconUrl }],
  }

  return {
    title: appName,
    description: "Plataforma de ranking e desafios do Tenis TCC.",
    manifest: "/manifest.webmanifest",
    icons,
  }
}

export const viewport: Viewport = {
  themeColor: "#0b1218",
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
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-background text-foreground antialiased font-sans"
      >
        {children}
      </body>
    </html>
  );
}
