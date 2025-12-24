"use client";

import { ReactNode } from "react";

interface AnimatedBorderProps {
  children: ReactNode;
  className?: string;
  borderColor?: "matrix" | "cyber" | "gradient";
  glowIntensity?: "low" | "medium" | "high";
}

export function AnimatedBorder({
  children,
  className = "",
  borderColor = "gradient",
  glowIntensity = "medium",
}: AnimatedBorderProps) {
  const glowOpacity = {
    low: "0.1",
    medium: "0.2",
    high: "0.4",
  }[glowIntensity];

  const borderGradient = {
    matrix: "from-matrix via-matrix-light to-matrix",
    cyber: "from-cyber via-cyber-light to-cyber",
    gradient: "from-matrix via-cyber to-matrix",
  }[borderColor];

  return (
    <div className={`relative group ${className}`}>
      {/* Animated border */}
      <div
        className={`absolute -inset-[1px] rounded-lg bg-gradient-to-r ${borderGradient} opacity-50 group-hover:opacity-100 blur-[2px] transition-opacity duration-500`}
        style={{
          animation: "spin 4s linear infinite",
        }}
      />

      {/* Glow effect */}
      <div
        className={`absolute -inset-[1px] rounded-lg bg-gradient-to-r ${borderGradient}`}
        style={{
          opacity: glowOpacity,
          filter: "blur(10px)",
          animation: "pulse 2s ease-in-out infinite",
        }}
      />

      {/* Content container */}
      <div className="relative rounded-lg bg-background">
        {children}
      </div>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

// Simpler version - just glowing border on hover
export function GlowBorder({
  children,
  className = "",
  color = "matrix",
}: {
  children: ReactNode;
  className?: string;
  color?: "matrix" | "cyber";
}) {
  const colorValues = {
    matrix: {
      border: "border-matrix/30 hover:border-matrix/60",
      shadow: "hover:shadow-[0_0_30px_rgba(0,255,0,0.2)]",
    },
    cyber: {
      border: "border-cyber/30 hover:border-cyber/60",
      shadow: "hover:shadow-[0_0_30px_rgba(0,255,255,0.2)]",
    },
  }[color];

  return (
    <div
      className={`relative rounded-lg border ${colorValues.border} ${colorValues.shadow} transition-all duration-500 ${className}`}
    >
      {children}
    </div>
  );
}
