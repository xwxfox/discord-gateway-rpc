import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Discord RPC Gateway",
  description: "Detached Discord RPC Gateway System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
