import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { DICTS, LOCALES, type Locale } from "@/lib/i18n/dict";
import "./globals.css";

/** Заголовок и описание — на языке браузера: их видят в поиске и в превью ссылки. */
export async function generateMetadata(): Promise<Metadata> {
  const wanted = (await headers()).get("accept-language") ?? "";
  const locale =
    wanted
      .split(",")
      .map((tag) => tag.trim().toLowerCase().split(/[-;]/)[0])
      .find((base): base is Locale => (LOCALES as readonly string[]).includes(base)) ?? "en";
  const dict = DICTS[locale];
  return { title: dict["meta.title"], description: dict["meta.description"] };
}

// игра живёт на один экран: зум страницы и вырезы под камеру нам мешают
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0c0f0c",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* тему ставим до первой отрисовки, иначе светлая тема мигает тёмным */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem(\"wb.theme\");document.documentElement.dataset.theme=t===\"light\"?\"light\":\"dark\"}catch(e){}",
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
