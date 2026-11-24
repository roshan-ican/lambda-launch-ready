import type { Metadata } from "next";
import { JetBrains_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

// Data terminal style: Public Sans for text, JetBrains Mono for every id and figure
// (the style's "face": digits that stack while numbers update every second).
const sans = Public_Sans({ variable: "--font-text", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-figure", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Checkout · Launch-ready payments",
  description: "Live checkout console for the payments Lambda platform on LocalStack",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
