import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tech Week Concierge",
  description: "From 1,600 events to your agenda — curated to who you are.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
