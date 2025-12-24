"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [isTextInput, setIsTextInput] = useState(false);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    const isOverCodeEditor = (target: HTMLElement): boolean => {
      return !!(
        target.closest(".cm-editor") ||
        target.closest(".cm-content") ||
        target.closest("[data-crt-color]") ||
        target.matches("input, textarea, [contenteditable]")
      );
    };

    const isOverClickable = (target: HTMLElement): boolean => {
      return !!(
        target.closest("button") ||
        target.closest("a") ||
        target.closest("[data-cursor-hover]")
      );
    };

    const handleMouseMove = (e: MouseEvent) => {
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      gsap.to(cursor, {
        x: mouseX,
        y: mouseY,
        duration: 0.15,
        ease: "power2.out",
      });

      const target = e.target as HTMLElement;

      if (isOverCodeEditor(target)) {
        setIsTextInput(true);
        gsap.to(cursor, { scale: 1, opacity: 1, duration: 0.2 });
      } else if (isOverClickable(target)) {
        setIsTextInput(false);
        gsap.to(cursor, { scale: 1.5, opacity: 0.7, duration: 0.2 });
      } else {
        setIsTextInput(false);
        gsap.to(cursor, { scale: 1, opacity: 1, duration: 0.2 });
      }
    };

    const handleMouseDown = () => {
      gsap.to(cursor, { scale: 0.8, duration: 0.1 });
    };

    const handleMouseUp = () => {
      gsap.to(cursor, { scale: 1, duration: 0.15, ease: "back.out(2)" });
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <>
      <div
        ref={cursorRef}
        className="fixed pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2"
      >
        {isTextInput ? (
          // Typing cursor - glowing I-beam (shorter)
          <div className="relative">
            <div
              style={{
                width: "1.5px",
                height: "14px",
                background: "#ffffff",
                boxShadow: "0 0 4px #ffffff, 0 0 8px #00ff00",
                borderRadius: "1px",
              }}
            />
            <div
              className="absolute -top-[1px] left-1/2 -translate-x-1/2"
              style={{
                width: "6px",
                height: "1.5px",
                background: "#ffffff",
                boxShadow: "0 0 3px #ffffff, 0 0 6px #00ff00",
                borderRadius: "1px",
              }}
            />
            <div
              className="absolute -bottom-[1px] left-1/2 -translate-x-1/2"
              style={{
                width: "6px",
                height: "1.5px",
                background: "#ffffff",
                boxShadow: "0 0 3px #ffffff, 0 0 6px #00ff00",
                borderRadius: "1px",
              }}
            />
          </div>
        ) : (
          // Crosshair cursor - white
          <>
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: "20px",
                height: "1px",
                background: "#ffffff",
                boxShadow: "0 0 4px #ffffff, 0 0 8px rgba(255,255,255,0.5)",
              }}
            />
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: "1px",
                height: "20px",
                background: "#ffffff",
                boxShadow: "0 0 4px #ffffff, 0 0 8px rgba(255,255,255,0.5)",
              }}
            />
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: "3px",
                height: "3px",
                background: "#ffffff",
                borderRadius: "50%",
                boxShadow: "0 0 6px #ffffff",
              }}
            />
          </>
        )}
      </div>

      <style jsx global>{`
        * {
          cursor: none !important;
        }
        @media (max-width: 768px) {
          * {
            cursor: auto !important;
          }
        }
      `}</style>
    </>
  );
}
