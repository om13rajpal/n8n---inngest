import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SmoothScrollProvider } from "@/components/smooth-scroll-provider";
import { CustomCursor } from "@/components/custom-cursor";
import { MatrixRain } from "@/components/matrix-rain";
import { CRTEffectLight } from "@/components/crt-effect";
import { FloatingParticles } from "@/components/floating-particles";
import { AuroraBeam } from "@/components/aurora-beam";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "n8n → Inngest | Workflow Converter",
  description: "Transform your n8n workflows into production-ready Inngest functions",
  keywords: ["n8n", "inngest", "workflow", "converter", "automation", "typescript"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <SmoothScrollProvider>
          {/* Aurora beam effect - top layer */}
          <AuroraBeam />

          {/* Background effects */}
          <MatrixRain />
          <FloatingParticles />
          <div className="noise" />
          <CRTEffectLight />

          {/* Custom cursor */}
          <CustomCursor />

          {/* Main content */}
          <main className="relative min-h-screen bg-background z-10">
            {children}
          </main>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
