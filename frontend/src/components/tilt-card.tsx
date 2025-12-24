"use client";

import { useRef, ReactNode } from "react";
import { gsap } from "gsap";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  tiltAmount?: number;
  glareEnabled?: boolean;
  scale?: number;
}

export function TiltCard({
  children,
  className = "",
  tiltAmount = 10,
  glareEnabled = true,
  scale = 1.02,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    const glare = glareRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -tiltAmount;
    const rotateY = ((x - centerX) / centerX) * tiltAmount;

    gsap.to(card, {
      rotateX,
      rotateY,
      scale,
      duration: 0.3,
      ease: "power2.out",
      transformPerspective: 1000,
    });

    // Update glare position
    if (glare && glareEnabled) {
      const glareX = (x / rect.width) * 100;
      const glareY = (y / rect.height) * 100;
      gsap.to(glare, {
        background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(0, 255, 0, 0.15) 0%, transparent 50%)`,
        duration: 0.3,
      });
    }
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    const glare = glareRef.current;
    if (!card) return;

    gsap.to(card, {
      rotateX: 0,
      rotateY: 0,
      scale: 1,
      duration: 0.5,
      ease: "elastic.out(1, 0.5)",
    });

    if (glare && glareEnabled) {
      gsap.to(glare, {
        background: "transparent",
        duration: 0.3,
      });
    }
  };

  return (
    <div
      ref={cardRef}
      className={`relative transform-gpu ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transformStyle: "preserve-3d" }}
    >
      {children}
      {glareEnabled && (
        <div
          ref={glareRef}
          className="absolute inset-0 pointer-events-none rounded-inherit z-10"
          style={{ borderRadius: "inherit" }}
        />
      )}
    </div>
  );
}
