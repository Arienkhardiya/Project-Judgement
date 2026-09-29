import React from 'react';

/**
 * BackgroundSignature - Premium Cinematic SaaS Ambient Backdrop
 *
 * Renders layered atmospheric glows, subtle competition graph topology lines,
 * and a deep graphite geometric grid structure.
 *
 * Invariants:
 * - pointer-events: none (Strictly non-interactive, purely visual backdrop)
 * - Fixed full-bleed viewport positioning with hardware-accelerated transforms
 * - CSS-only lightweight rendering without external dependencies or heavy canvas loops
 */
export default function BackgroundSignature() {
  return (
    <div className="bg-signature-viewport" aria-hidden="true">
      {/* Primary Radial Glow Emitters */}
      <div className="bg-glow bg-glow-top-cyan" />
      <div className="bg-glow bg-glow-bottom-indigo" />
      <div className="bg-glow bg-glow-accent-violet" />

      {/* Cybernetic Geometric Grid Pattern */}
      <div className="bg-geometric-grid" />

      {/* Abstract Judging Constellation / Tournament Topology SVG */}
      <svg
        className="bg-constellation-svg"
        viewBox="0 0 1440 900"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="lineGradA" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGradB" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.2" />
            <stop offset="70%" stopColor="#38bdf8" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="nodeGlowCyan" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="40%" stopColor="#38bdf8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nodeGlowViolet" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
            <stop offset="40%" stopColor="#a855f7" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Tournament Graph Network Lines */}
        <g stroke="url(#lineGradA)" strokeWidth="1" strokeDasharray="3 6" className="constellation-lines">
          <line x1="180" y1="120" x2="340" y2="240" />
          <line x1="340" y1="240" x2="520" y2="160" />
          <line x1="520" y1="160" x2="720" y2="280" />
          <line x1="720" y1="280" x2="940" y2="180" />
          <line x1="940" y1="180" x2="1140" y2="260" />
          <line x1="1140" y1="260" x2="1320" y2="150" />
        </g>

        <g stroke="url(#lineGradB)" strokeWidth="1" strokeDasharray="4 8" className="constellation-lines-alt">
          <line x1="260" y1="360" x2="480" y2="420" />
          <line x1="480" y1="420" x2="720" y2="280" />
          <line x1="720" y1="280" x2="980" y2="460" />
          <line x1="980" y1="460" x2="1220" y2="380" />
          <line x1="340" y1="240" x2="260" y2="360" />
          <line x1="1140" y1="260" x2="1220" y2="380" />
        </g>

        {/* Node Points representing Evaluation Junctions */}
        <circle cx="180" cy="120" r="16" fill="url(#nodeGlowCyan)" />
        <circle cx="180" cy="120" r="2.5" fill="#38bdf8" />

        <circle cx="340" cy="240" r="14" fill="url(#nodeGlowCyan)" />
        <circle cx="340" cy="240" r="2" fill="#38bdf8" />

        <circle cx="520" cy="160" r="18" fill="url(#nodeGlowViolet)" />
        <circle cx="520" cy="160" r="3" fill="#c084fc" />

        <circle cx="720" cy="280" r="24" fill="url(#nodeGlowCyan)" />
        <circle cx="720" cy="280" r="3.5" fill="#38bdf8" />

        <circle cx="940" cy="180" r="16" fill="url(#nodeGlowCyan)" />
        <circle cx="940" cy="180" r="2.5" fill="#38bdf8" />

        <circle cx="1140" cy="260" r="20" fill="url(#nodeGlowViolet)" />
        <circle cx="1140" cy="260" r="3" fill="#c084fc" />

        <circle cx="1320" cy="150" r="14" fill="url(#nodeGlowCyan)" />
        <circle cx="1320" cy="150" r="2" fill="#38bdf8" />

        <circle cx="260" cy="360" r="18" fill="url(#nodeGlowViolet)" />
        <circle cx="260" cy="360" r="2.5" fill="#c084fc" />

        <circle cx="480" cy="420" r="16" fill="url(#nodeGlowCyan)" />
        <circle cx="480" cy="420" r="2.5" fill="#38bdf8" />

        <circle cx="980" cy="460" r="22" fill="url(#nodeGlowViolet)" />
        <circle cx="980" cy="460" r="3" fill="#c084fc" />

        <circle cx="1220" cy="380" r="16" fill="url(#nodeGlowCyan)" />
        <circle cx="1220" cy="380" r="2.5" fill="#38bdf8" />
      </svg>
    </div>
  );
}
