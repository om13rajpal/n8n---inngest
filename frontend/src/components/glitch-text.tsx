"use client";

import { useEffect, useRef, useState } from "react";

interface GlitchTextProps {
  text: string;
  className?: string;
  glitchOnHover?: boolean;
  continuous?: boolean;
}

export function GlitchText({
  text,
  className = "",
  glitchOnHover = true,
  continuous = false,
}: GlitchTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isGlitching, setIsGlitching] = useState(continuous);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const chars = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`アイウエオ01";

  const scramble = () => {
    let iteration = 0;
    const originalText = text;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      setDisplayText(
        originalText
          .split("")
          .map((char, index) => {
            if (index < iteration) {
              return originalText[index];
            }
            if (char === " ") return " ";
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join("")
      );

      if (iteration >= originalText.length) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        if (continuous) {
          setTimeout(scramble, 2000);
        }
      }

      iteration += 1 / 3;
    }, 30);
  };

  useEffect(() => {
    if (continuous) {
      scramble();
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [continuous, text]);

  const handleMouseEnter = () => {
    if (glitchOnHover && !continuous) {
      setIsGlitching(true);
      scramble();
    }
  };

  const handleMouseLeave = () => {
    if (glitchOnHover && !continuous) {
      setIsGlitching(false);
      setDisplayText(text);
    }
  };

  return (
    <span
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-cursor-hover
    >
      <span className="relative z-10">{displayText}</span>
      {isGlitching && (
        <>
          <span
            className="absolute inset-0 text-cyber opacity-80 z-0"
            style={{
              clipPath: "inset(10% 0 60% 0)",
              transform: "translate(-2px, -1px)",
            }}
          >
            {displayText}
          </span>
          <span
            className="absolute inset-0 text-red-500 opacity-80 z-0"
            style={{
              clipPath: "inset(40% 0 20% 0)",
              transform: "translate(2px, 1px)",
            }}
          >
            {displayText}
          </span>
        </>
      )}
    </span>
  );
}

// Simpler glitch effect with CSS only
export function CSSGlitchText({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`glitch-wrapper ${className}`} data-cursor-hover>
      <span className="glitch" data-text={children}>
        {children}
      </span>
      <style jsx>{`
        .glitch-wrapper {
          position: relative;
          display: inline-block;
        }
        .glitch {
          position: relative;
          display: inline-block;
        }
        .glitch::before,
        .glitch::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
        }
        .glitch-wrapper:hover .glitch::before {
          animation: glitch-1 0.3s infinite linear alternate-reverse;
          color: #00ffff;
          opacity: 0.8;
        }
        .glitch-wrapper:hover .glitch::after {
          animation: glitch-2 0.3s infinite linear alternate-reverse;
          color: #ff0000;
          opacity: 0.8;
        }
        @keyframes glitch-1 {
          0% {
            clip-path: inset(20% 0 30% 0);
            transform: translate(-3px, -2px);
          }
          20% {
            clip-path: inset(60% 0 10% 0);
            transform: translate(3px, 1px);
          }
          40% {
            clip-path: inset(10% 0 70% 0);
            transform: translate(-2px, 2px);
          }
          60% {
            clip-path: inset(50% 0 20% 0);
            transform: translate(2px, -1px);
          }
          80% {
            clip-path: inset(30% 0 40% 0);
            transform: translate(-3px, 2px);
          }
          100% {
            clip-path: inset(70% 0 5% 0);
            transform: translate(3px, -2px);
          }
        }
        @keyframes glitch-2 {
          0% {
            clip-path: inset(70% 0 5% 0);
            transform: translate(3px, 2px);
          }
          20% {
            clip-path: inset(10% 0 60% 0);
            transform: translate(-3px, -1px);
          }
          40% {
            clip-path: inset(50% 0 20% 0);
            transform: translate(2px, -2px);
          }
          60% {
            clip-path: inset(20% 0 50% 0);
            transform: translate(-2px, 1px);
          }
          80% {
            clip-path: inset(60% 0 10% 0);
            transform: translate(3px, -2px);
          }
          100% {
            clip-path: inset(5% 0 70% 0);
            transform: translate(-3px, 2px);
          }
        }
      `}</style>
    </span>
  );
}
