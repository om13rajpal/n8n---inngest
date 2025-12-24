"use client";

import { ReactNode } from "react";

interface CRTScreenProps {
  children: ReactNode;
  className?: string;
  color?: "green" | "cyan";
}

export function CRTScreen({ children, className = "", color = "green" }: CRTScreenProps) {
  // Subtle phosphor glow
  const glowColor = color === "green"
    ? "rgba(0, 255, 0, 0.03)"
    : "rgba(0, 255, 255, 0.03)";

  return (
    <div
      className={`crt-screen-wrapper relative overflow-hidden ${className}`}
      data-crt-color={color}
    >
      {/* Main content */}
      <div className="crt-content relative z-10">
        {children}
      </div>

      {/* Scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.15) 2px,
            rgba(0, 0, 0, 0.15) 4px
          )`,
        }}
      />

      {/* Phosphor glow effect */}
      <div
        className="absolute inset-0 pointer-events-none z-20 mix-blend-screen"
        style={{
          background: `radial-gradient(ellipse at center, ${glowColor} 0%, transparent 70%)`,
        }}
      />

      {/* Screen flicker */}
      <div className="crt-flicker absolute inset-0 pointer-events-none z-20" />

      {/* Subtle noise */}
      <div className="crt-noise absolute inset-0 pointer-events-none z-20" />

      {/* Vignette - darker edges */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          boxShadow: `inset 0 0 100px rgba(0, 0, 0, 0.5), inset 0 0 50px rgba(0, 0, 0, 0.3)`,
        }}
      />

      {/* CRT curvature effect - subtle barrel distortion simulation */}
      <div
        className="absolute inset-0 pointer-events-none z-30 rounded-lg"
        style={{
          background: `
            radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.03) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.1) 0%, transparent 50%),
            radial-gradient(ellipse at 0% 50%, rgba(0,0,0,0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 100% 50%, rgba(0,0,0,0.08) 0%, transparent 50%)
          `,
        }}
      />

      <style jsx>{`
        .crt-screen-wrapper {
          background: #0a0a0a;
        }

        @keyframes flicker {
          0% { opacity: 0.97; }
          5% { opacity: 0.95; }
          10% { opacity: 0.97; }
          15% { opacity: 0.94; }
          20% { opacity: 0.98; }
          50% { opacity: 0.96; }
          80% { opacity: 0.97; }
          90% { opacity: 0.94; }
          100% { opacity: 0.97; }
        }

        .crt-flicker {
          animation: flicker 0.15s infinite;
          background: transparent;
        }

        @keyframes noise {
          0%, 100% { background-position: 0 0; }
          10% { background-position: -5% -10%; }
          20% { background-position: -15% 5%; }
          30% { background-position: 7% -25%; }
          40% { background-position: 20% 25%; }
          50% { background-position: -25% 10%; }
          60% { background-position: 15% 5%; }
          70% { background-position: 0% 15%; }
          80% { background-position: 25% 35%; }
          90% { background-position: -10% 10%; }
        }

        .crt-noise {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          opacity: 0.03;
          animation: noise 0.5s steps(10) infinite;
        }

        /* Very subtle retro text glow - crisp text with hint of phosphor */
        .crt-content :global(*) {
          text-shadow: 0 0 1.5px currentColor;
        }
      `}</style>
    </div>
  );
}
