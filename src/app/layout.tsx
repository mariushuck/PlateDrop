import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import Footer from "@/components/ui/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Footer />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
