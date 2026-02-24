import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nova Max Store Panel",
  description: "Operations hub for Nova Max Logistics stores.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
