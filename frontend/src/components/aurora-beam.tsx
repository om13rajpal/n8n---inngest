"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Realistic Aurora Borealis effect
 * Vertical light beams/curtains that shimmer like the northern lights
 */
export function AuroraBeam() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const beams = container.querySelectorAll(".aurora-beam-strand");

    // Set initial state for all beams
    gsap.set(beams, {
      opacity: 0,
      scaleY: 0.3,
      transformOrigin: "top center",
    });

    // Set container initial state
    gsap.set(container, { opacity: 0 });

    // Main timeline
    const timeline = gsap.timeline({
      delay: 0.3,
    });

    // Fade in container
    timeline.to(container, {
      opacity: 1,
      duration: 0.3,
      ease: "power2.out",
    });

    // Animate each beam with staggered timing (faster for 3s total)
    beams.forEach((beam, index) => {
      const delay = index * 0.08;
      const duration = 0.8 + Math.random() * 0.5;

      timeline.to(
        beam,
        {
          opacity: 0.6 + Math.random() * 0.4,
          scaleY: 0.7 + Math.random() * 0.3,
          duration: duration,
          ease: "power2.inOut",
        },
        delay
      );

      // Add shimmer/wave animation
      gsap.to(beam, {
        scaleY: "+=0.1",
        opacity: "-=0.1",
        duration: 0.4 + Math.random() * 0.3,
        repeat: 2,
        yoyo: true,
        ease: "sine.inOut",
        delay: 0.3 + delay,
      });
    });

    // Fade out everything
    timeline.to(
      container,
      {
        opacity: 0,
        duration: 0.8,
        ease: "power2.in",
      },
      "+=0.5"
    );

    return () => {
      timeline.kill();
      gsap.killTweensOf(beams);
    };
  }, []);

  // Generate beam positions - darker green for matrix/hacker theme
  const beamConfigs = [
    { left: "5%", width: "8%", color: "rgba(0, 180, 0, 0.5)", blur: 15 },
    { left: "15%", width: "12%", color: "rgba(0, 160, 0, 0.6)", blur: 20 },
    { left: "28%", width: "6%", color: "rgba(0, 140, 0, 0.4)", blur: 12 },
    { left: "38%", width: "15%", color: "rgba(0, 170, 0, 0.5)", blur: 25 },
    { left: "52%", width: "10%", color: "rgba(0, 150, 0, 0.6)", blur: 18 },
    { left: "65%", width: "8%", color: "rgba(0, 140, 0, 0.4)", blur: 15 },
    { left: "75%", width: "14%", color: "rgba(0, 160, 0, 0.5)", blur: 22 },
    { left: "88%", width: "7%", color: "rgba(0, 150, 0, 0.4)", blur: 14 },
  ];

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "250px",
        zIndex: 10000,
        pointerEvents: "none",
        overflow: "hidden",
        opacity: 0,
      }}
    >
      {/* Aurora beams - vertical curtains */}
      {beamConfigs.map((config, index) => (
        <div
          key={index}
          className="aurora-beam-strand"
          style={{
            position: "absolute",
            top: 0,
            left: config.left,
            width: config.width,
            height: "100%",
            background: `linear-gradient(180deg, ${config.color} 0%, ${config.color.replace(/[\d.]+\)$/, "0.2)")} 40%, transparent 100%)`,
            filter: `blur(${config.blur}px)`,
            opacity: 0,
            transform: "scaleY(0.3)",
          }}
        />
      ))}

      {/* Horizontal glow at top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(0,160,0,0.6) 20%, rgba(0,180,0,0.8) 50%, rgba(0,160,0,0.6) 80%, transparent 100%)",
          filter: "blur(3px)",
          boxShadow: "0 0 20px 5px rgba(0, 150, 0, 0.3)",
        }}
      />

      {/* Ambient glow overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "10%",
          right: "10%",
          height: "150px",
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(0, 160, 0, 0.15) 0%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />
    </div>
  );
}
