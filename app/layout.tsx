import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Script from "next/script";
import { Shell } from "@/components/Shell";
import { NebulaProvider } from "@/context/NebulaContext";

// Both fonts live in the repo (SIL Open Font License), so neither the dev
// server, the build nor the installed app depends on reaching Google Fonts.
const figtree = localFont({
  src: "./fonts/Figtree-Variable.woff2",
  variable: "--font-figtree",
  weight: "300 700",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nebula",
  description: "Pool several Google Drive accounts into one storage space.",
  referrer: "no-referrer",
  icons: { apple: "/apple-icon-180.png" },
  appleWebApp: { capable: true, title: "Nebula", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f6f2ee",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Smooth scrolling for in-page links, but not when Next changes pages.
      data-scroll-behavior="smooth"
      className={`${figtree.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="grain min-h-full flex flex-col">
        <NebulaProvider>
          <Shell>{children}</Shell>
        </NebulaProvider>
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
