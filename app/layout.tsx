import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import AccentApplier from "@/components/AccentApplier";
import LoadingCurtain from "@/components/LoadingCurtain";
import FloatingHammer from "@/components/hammer/FloatingHammer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: "parcel — site planning for community builders",
  description:
    "Free, no-CAD-required AI site planning for nonprofits, community developers, and small teams. Describe a site in plain English, get a 3D plan that respects zoning setbacks.",
  applicationName: "parcel",
  keywords: [
    "site planning",
    "community development",
    "affordable housing",
    "zoning",
    "3D site plan",
    "AI architecture",
    "nonprofit",
  ],
  authors: [{ name: "parcel" }],
  openGraph: {
    title: "parcel — site planning for community builders",
    description:
      "Free, no-CAD-required AI site planning for nonprofits, community developers, and small teams.",
    siteName: "parcel",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "parcel — site planning for community builders",
    description:
      "Free, no-CAD-required AI site planning for nonprofits and small teams.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans grain text-paper">
        <AccentApplier />
        {children}
        <LoadingCurtain />
        <FloatingHammer />
      </body>
    </html>
  );
}
