import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, Oswald } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Condensed grotesque for headings — industrial signage feel.
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "RC Pisos Industriales — CRM",
  description: "CRM comercial y administrativo de RC Pisos Industriales",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Preferencia de tema por usuario (cookie). Oscuro grafito por defecto.
  const cookieStore = await cookies();
  const theme =
    cookieStore.get("theme")?.value === "light" ? "light" : "dark";

  return (
    <html
      lang="es"
      className={`${theme === "dark" ? "dark " : ""}${geistSans.variable} ${geistMono.variable} ${oswald.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
