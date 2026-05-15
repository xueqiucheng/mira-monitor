import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mira Monitor",
  description: "Mira 海外版 · 全局监控大屏",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full`} suppressHydrationWarning>
    <body className="min-h-full bg-background font-sans text-foreground antialiased">
      <QueryProvider>{children}</QueryProvider>
    </body>
  </html>
);

export default RootLayout;
