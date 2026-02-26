import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nova Max | لوحة المتجر",
    template: "%s | Nova Max",
  },
  description: "لوحة تحكم المتاجر لمنظومة Nova Max اللوجستية.",
  applicationName: "Nova Max",
  keywords: ["Nova Max", "Nova", "لوحة المتجر", "نظام التوصيل", "لوجستيات"],
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Nova Max | لوحة المتجر",
    description: "لوحة تحكم المتاجر لمنظومة Nova Max اللوجستية.",
    type: "website",
    locale: "ar_LY",
  },
  twitter: {
    card: "summary",
    title: "Nova Max | لوحة المتجر",
    description: "لوحة تحكم المتاجر لمنظومة Nova Max اللوجستية.",
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f97316",
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
