import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cinzel, Sarabun } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["600", "800"],
  display: "swap",
});

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "D&D 5e Solo Campaign — AI DM",
  description: "A solo D&D 5e adventure: an AI is your Dungeon Master while a deterministic engine rolls the dice and enforces the rules. Build a hero, explore the map, fight monsters, and level up.",
  keywords: ["D&D", "Dungeons and Dragons", "5e", "solo RPG", "AI DM", "interactive fiction"],
  authors: [{ name: "Z.ai" }],
  manifest: "/manifest.json",
  icons: {
    // Phase 6: use local SVG instead of external CDN (offline-friendly PWA)
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  openGraph: {
    title: "D&D 5e Solo Campaign",
    description: "AI is the DM · dice & rules calculated by a deterministic engine",
    siteName: "Z.ai",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0D0A14",
  // Phase 6: safe-area-inset for iOS notch + PWA display mode
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${sarabun.variable} antialiased`}
      >
        {children}
        <Toaster />
        {/* Phase 6: Register service worker for PWA offline support */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); }); }`,
          }}
        />
      </body>
    </html>
  );
}
