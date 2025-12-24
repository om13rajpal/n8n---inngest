"use client";

export function CRTEffect() {
  return (
    <>
      {/* Scanlines */}
      <div className="fixed inset-0 pointer-events-none z-[9990] opacity-[0.03]">
        <div
          className="w-full h-full"
          style={{
            background: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.3) 2px,
              rgba(0, 0, 0, 0.3) 4px
            )`,
          }}
        />
      </div>

      {/* CRT flicker */}
      <div className="fixed inset-0 pointer-events-none z-[9991] crt-flicker" />

      {/* Vignette */}
      <div
        className="fixed inset-0 pointer-events-none z-[9989]"
        style={{
          background: `radial-gradient(ellipse at center, transparent 0%, transparent 60%, rgba(0, 0, 0, 0.4) 100%)`,
        }}
      />

      {/* RGB shift on edges */}
      <div
        className="fixed inset-0 pointer-events-none z-[9988] opacity-30"
        style={{
          background: `
            linear-gradient(90deg, rgba(255, 0, 0, 0.03) 0%, transparent 5%, transparent 95%, rgba(0, 255, 255, 0.03) 100%)
          `,
        }}
      />

      <style jsx global>{`
        @keyframes crt-flicker {
          0% {
            opacity: 0.02;
          }
          5% {
            opacity: 0.025;
          }
          10% {
            opacity: 0.02;
          }
          15% {
            opacity: 0.03;
          }
          20% {
            opacity: 0.02;
          }
          50% {
            opacity: 0.025;
          }
          80% {
            opacity: 0.02;
          }
          90% {
            opacity: 0.03;
          }
          100% {
            opacity: 0.02;
          }
        }

        .crt-flicker {
          background: rgba(18, 16, 16, 0.1);
          animation: crt-flicker 0.15s infinite;
        }

        /* Optional: Add screen curvature effect */
        @supports (backdrop-filter: blur(0px)) {
          .crt-screen {
            border-radius: 20px;
            overflow: hidden;
          }
        }
      `}</style>
    </>
  );
}

// Lighter version without too much visual noise
export function CRTEffectLight() {
  return (
    <>
      {/* Subtle scanlines */}
      <div className="fixed inset-0 pointer-events-none z-[9990] opacity-[0.015]">
        <div
          className="w-full h-full"
          style={{
            background: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 1px,
              rgba(0, 255, 0, 0.1) 1px,
              rgba(0, 255, 0, 0.1) 2px
            )`,
          }}
        />
      </div>

      {/* Soft vignette */}
      <div
        className="fixed inset-0 pointer-events-none z-[9989]"
        style={{
          background: `radial-gradient(ellipse at center, transparent 0%, transparent 70%, rgba(0, 0, 0, 0.3) 100%)`,
        }}
      />
    </>
  );
}
