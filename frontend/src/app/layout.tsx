import type { Metadata } from "next";
import { Fraunces, Newsreader } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Clipscript",
  description:
    "Paste a YouTube, TikTok, or Instagram link and read every word said in the video.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
