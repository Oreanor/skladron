import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skladron — Складская оборона",
  description: "Строй склад, зарабатывай на площади, отбивай налёты дронов.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
