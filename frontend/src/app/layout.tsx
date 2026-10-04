import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import FetchInterceptor from "@/components/layout/FetchInterceptor";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "TutorSolve CRM",
  description: "A centralized WhatsApp CRM for support teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <head>
        <meta name="apple-mobile-web-app-title" content="TutorSolve" />
      </head>
      <body className="min-h-full flex flex-col">
        <FetchInterceptor />
        {children}
      </body>
    </html>
  );
}
