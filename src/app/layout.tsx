import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nova-max-ws.pages.dev"),
  title: {
    default: "Nova Max | لوحة تحكم المتجر",
    template: "%s | Nova Max",
  },
  description: "لوحة تحكم المتجر لمنظومة Nova Max اللوجستية.",
  applicationName: "Nova Max",
  keywords: ['Nova Max', 'Nova', 'لوحة تحكم المتجر', 'Delivery', 'Logistics'],
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Nova Max | لوحة تحكم المتجر",
    description: "لوحة تحكم المتجر لمنظومة Nova Max اللوجستية.",
    type: "website",
    locale: "ar_LY",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Nova Max",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nova Max | لوحة تحكم المتجر",
    description: "لوحة تحكم المتجر لمنظومة Nova Max اللوجستية.",
    images: ["/logo.png"],
  },
  manifest: "/manifest.webmanifest",
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
