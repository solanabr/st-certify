import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { ThemeProvider } from "@/components/theme-provider";
import { MockRoleSwitcher } from "@/components/dev/mock-role-switcher";
import { LocaleProvider } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { isUiMock } from "@/lib/mock";

const inter = localFont({
  src: [
    {
      path: "../assets/fonts/Inter-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../assets/fonts/Inter-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const greatVibes = localFont({
  src: "../assets/fonts/GreatVibes-Regular.ttf",
  weight: "400",
  style: "normal",
  variable: "--font-great-vibes",
  display: "swap",
});

// viewport-fit=cover lets the layout paint into the iOS safe areas; the
// theme-color pair tracks the two canvases declared in globals.css.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5e8ca" },
    { media: "(prefers-color-scheme: dark)", color: "#11160f" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  const title = "Superteam Certify";
  const description = t("meta.description");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    metadataBase: new URL(appUrl),
    title: { default: title, template: `%s · ${title}` },
    description,
    applicationName: title,
    // app/icon.svg (favicon) + app/opengraph-image.tsx are auto-wired by Next's
    // file conventions; the explicit icons block adds the legacy .ico fallback
    // and the home-screen icon iOS reads (it ignores the manifest's icons).
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", sizes: "any" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    appleWebApp: {
      capable: true,
      title,
      // Opaque bar: "black-translucent" would put white glyphs on the cream
      // canvas once viewport-fit=cover extends content under the status bar.
      statusBarStyle: "default",
    },
    openGraph: {
      type: "website",
      siteName: title,
      title,
      description,
      url: appUrl,
      locale: "pt_BR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const { t } = await getT();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${archivo.variable} ${greatVibes.variable}`}
      // next-themes mutates <html> class/style before hydration.
      suppressHydrationWarning
    >
      <body className="antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("layout.skipToContent")}
        </a>
        <ThemeProvider>
          <LocaleProvider initialLocale={locale}>
            <Providers>
              <div className="flex min-h-dvh flex-col">
                <Nav />
                <main id="main-content" className="flex-1">
                  {children}
                </main>
                <Footer />
              </div>
              {/* Dev-only: never reaches a production build (see lib/mock/flag.ts). */}
              {isUiMock() && <MockRoleSwitcher />}
            </Providers>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
