"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

// Master entrance animation for the app
export function useEntranceAnimation() {
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
      });

      // Header animation - fade from top
      tl.from("[data-animate='header']", {
        y: -50,
        opacity: 0,
        duration: 1,
        force3D: true,
      })
        // Title with character split effect feel
        .from("[data-animate='title']", {
          y: 80,
          opacity: 0,
          duration: 1.2,
          force3D: true,
        }, "-=0.6")
        // Subtitle
        .from("[data-animate='subtitle']", {
          y: 30,
          opacity: 0,
          duration: 0.8,
        }, "-=0.8")
        // Left panel - slide from left
        .from("[data-animate='panel-left']", {
          x: -100,
          opacity: 0,
          duration: 1,
          force3D: true,
        }, "-=0.5")
        // Right panel - slide from right
        .from("[data-animate='panel-right']", {
          x: 100,
          opacity: 0,
          duration: 1,
          force3D: true,
        }, "-=0.9")
        // Options bar - fade up
        .from("[data-animate='options']", {
          y: 40,
          opacity: 0,
          duration: 0.8,
        }, "-=0.6")
        // Footer
        .from("[data-animate='footer']", {
          opacity: 0,
          duration: 0.6,
        }, "-=0.3");
    });

    return () => ctx.revert();
  }, []);
}

// Magnetic button effect
export function useMagneticEffect(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      gsap.to(element, {
        x: x * 0.3,
        y: y * 0.3,
        duration: 0.3,
        ease: "power2.out",
      });
    };

    const handleMouseLeave = () => {
      gsap.to(element, {
        x: 0,
        y: 0,
        duration: 0.5,
        ease: "elastic.out(1, 0.3)",
      });
    };

    element.addEventListener("mousemove", handleMouseMove);
    element.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      element.removeEventListener("mousemove", handleMouseMove);
      element.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [ref]);
}

// Hover scale effect for cards
export function useHoverScale(ref: React.RefObject<HTMLElement>, scale = 1.02) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseEnter = () => {
      gsap.to(element, {
        scale,
        duration: 0.4,
        ease: "power2.out",
      });
    };

    const handleMouseLeave = () => {
      gsap.to(element, {
        scale: 1,
        duration: 0.4,
        ease: "power2.out",
      });
    };

    element.addEventListener("mouseenter", handleMouseEnter);
    element.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      element.removeEventListener("mouseenter", handleMouseEnter);
      element.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [ref, scale]);
}

// Stagger reveal for lists
export function useStaggerReveal(containerRef: React.RefObject<HTMLElement>, itemSelector: string) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = container.querySelectorAll(itemSelector);

    gsap.from(items, {
      y: 20,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: "power2.out",
      delay: 0.2,
    });
  }, [containerRef, itemSelector]);
}

// Button click animation
export function animateButtonClick(element: HTMLElement) {
  gsap.timeline()
    .to(element, {
      scale: 0.95,
      duration: 0.1,
      ease: "power2.in",
    })
    .to(element, {
      scale: 1,
      duration: 0.3,
      ease: "elastic.out(1, 0.5)",
    });
}

// Success animation (checkmark feel)
export function animateSuccess(element: HTMLElement) {
  gsap.timeline()
    .to(element, {
      scale: 1.1,
      duration: 0.2,
      ease: "power2.out",
    })
    .to(element, {
      scale: 1,
      duration: 0.4,
      ease: "elastic.out(1, 0.3)",
    });
}

// Error shake animation
export function animateError(element: HTMLElement) {
  gsap.timeline()
    .to(element, { x: -10, duration: 0.1 })
    .to(element, { x: 10, duration: 0.1 })
    .to(element, { x: -10, duration: 0.1 })
    .to(element, { x: 10, duration: 0.1 })
    .to(element, { x: 0, duration: 0.1 });
}

// Loading pulse animation
export function useLoadingPulse(ref: React.RefObject<HTMLElement>, isLoading: boolean) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (isLoading) {
      gsap.to(element, {
        opacity: 0.5,
        duration: 0.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    } else {
      gsap.killTweensOf(element);
      gsap.to(element, {
        opacity: 1,
        duration: 0.3,
      });
    }
  }, [ref, isLoading]);
}
