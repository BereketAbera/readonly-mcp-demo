import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteOrigin } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const DESCRIPTION =
  "Read-only Connecteam and ROLLER data for ClickUp's AI: a remote MCP server (Streamable HTTP) with mocked APIs and a fictional venue, with no way to change anything.";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: "Read-only MCP server for ClickUp", template: "%s · Read-only MCP server for ClickUp" },
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    title: "Connecteam + ROLLER → ClickUp, read-only",
    description: DESCRIPTION,
    siteName: "Lakeside read-only MCP (fictional data)",
  },
  twitter: { card: "summary_large_image", title: "Connecteam + ROLLER → ClickUp, read-only", description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#ffffff", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 sm:px-6 sm:pt-10">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
