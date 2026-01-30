import type { Metadata } from "next"
import "./globals.css"

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Ranking Tênis TCC";

export const metadata: Metadata = {
  title: appName,
  description: "Plataforma de ranking e desafios do Tênis TCC.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className="min-h-screen bg-background text-foreground antialiased font-sans"
      >
        {children}
      </body>
    </html>
  );
}
