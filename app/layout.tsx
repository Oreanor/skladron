import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skladron — Складская оборона",
  description: "Строй склад, зарабатывай на площади, отбивай налёты дронов.",
};

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
