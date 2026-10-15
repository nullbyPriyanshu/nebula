import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { Shell } from "@/components/Shell";
import { NebulaProvider } from "@/context/NebulaContext";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
