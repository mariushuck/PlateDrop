import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import Footer from "@/components/ui/Footer";

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
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Footer />
        <Toaster richColors theme="system" position="top-center" />
      </body>
    </html>
  );
}
