import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-app",
});

export const metadata: Metadata = {
  title: {
    default: "Listen To Your Heart",
    template: "%s · Listen To Your Heart",
  },
  description: "A private, browser-native music player with playlists, favorites and a full queue.",
  applicationName: "Listen To Your Heart",
  appleWebApp: { capable: true, title: "Listen", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0e" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  // The player bar sits against the bottom edge on phones.
  viewportFit: "cover",
};

/**
 * Applied before first paint so a light-theme user never sees a dark flash.
 * Inline because a stylesheet cannot read localStorage.
 */
const THEME_BOOTSTRAP = `
try {
  var stored = JSON.parse(localStorage.getItem("lyh-ui") || "{}");
  document.documentElement.dataset.theme = stored?.state?.theme || "dark";
} catch (error) {
  document.documentElement.dataset.theme = "dark";
}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
        >
          Skip to content
        </a>
        <AppShell>
          <div id="main-content">{children}</div>
        </AppShell>
      </body>
    </html>
  );
}
