import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legacy League",
  description: "Our dynasty basketball league",
  applicationName: "Legacy",
  // Opens full screen (no Safari bar) when launched from the home screen.
  appleWebApp: { capable: true, title: "Legacy", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1c1917" };

// Shared by the league app, (league)/layout.tsx, and the bidding site, bidding/layout.tsx.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
