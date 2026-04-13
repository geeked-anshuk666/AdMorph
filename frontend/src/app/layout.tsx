import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admorph - AI Landing Page Personalization",
  description:
    "Personalize any landing page to match your ad creative in seconds. Powered by Gemini AI. Non-destructive JSON diff approach - zero UI breakage.",
  keywords: ["landing page personalization", "CRO", "ad creative", "AI", "conversion optimization"],
  openGraph: {
    title: "Admorph - AI Landing Page Personalization",
    description: "Match your landing page to your ad. Higher conversion. Zero breakage.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Admorph - AI Landing Page Personalization</title>
        <meta name="description" content="Personalize any landing page to match your ad creative in seconds." />
        <meta property="og:title" content="Admorph AI" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
