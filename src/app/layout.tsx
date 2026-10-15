import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppToaster from "@/components/ui/AppToaster";
import Footer from "@/components/ui/Footer";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "PlateDrop | Der anonyme Briefkasten für dein Auto",
  description:
    "Jemandem Bescheid geben, dass sein Licht kaputt ist? Einfach Kennzeichen eingeben und Nachricht hinterlassen. 100% anonym und sicher.",
  openGraph: {
    title: "PlateDrop | Der anonyme Briefkasten für dein Auto",
    description:
      "Jemandem Bescheid geben, dass sein Licht kaputt ist? Einfach Kennzeichen eingeben und Nachricht hinterlassen. 100% anonym und sicher.",
    type: "website",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The init script sets data-theme before hydration.
    <html lang="de" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: fester Text aus src/lib/theme.ts, keine Eingabe */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Footer />
        <AppToaster />
      </body>
    </html>
  );
}
