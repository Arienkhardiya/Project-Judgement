import React, { useEffect, useRef, useState } from 'react';

/**
 * CustomCursor - Premium Interactive Desktop Cursor
 *
 * Provides a dual-layer cursor with a precision tracking dot and an
 * interpolated trailing ring with magnetic expansion on interactive controls.
 *
 * Invariants:
 * - pointer-events: none !important (Never obstructs clicks or focus)
 * - Automatically deactivated on touch / coarse devices
 * - Respects prefers-reduced-motion
 * - Collapses gracefully over text inputs to prioritize typing
 */
export default function CustomCursor() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false);
  const [isTextHover, setIsTextHover] = useState(false);

  const dotRef = useRef(null);
  const ringRef = useRef(null);

  // Raw mouse coordinates
  const mousePos = useRef({ x: -100, y: -100 });
  // Interpolated ring coordinates
  const ringPos = useRef({ x: -100, y: -100 });
  const animFrameId = useRef(null);

  useEffect(() => {
    // Only enable on desktop pointer devices with fine precision and without reduced motion
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!hasFinePointer || prefersReducedMotion) {
      setIsEnabled(false);
      return;
    }

    setIsEnabled(true);

    const onPointerMove = (e) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      setIsVisible(true);

      // Check hovered element type
      const target = e.target;
      if (!target || !(target instanceof Element)) return;

      const isInput = Boolean(
        target.closest('input[type="text"], input[type="email"], input[type="password"], textarea, [contenteditable="true"]')
      );
      setIsTextHover(isInput);

      if (!isInput) {
        const isClickable = Boolean(
          target.closest('a, button, [role="button"], input[type="submit"], input[type="button"], select, .project-card, .tab-btn, .track-chip-btn, .demo-btn, .nav-link, .modal-close-btn, .score-input, .radio-card')
        );
        setIsInteractive(isClickable);
      } else {
        setIsInteractive(false);
      }
    };

    const onMouseDown = () => setIsClicking(true);
    const onMouseUp = () => setIsClicking(false);
    const onMouseLeave = () => setIsVisible(false);
    const onMouseEnter = () => setIsVisible(true);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('mouseenter', onMouseEnter);

    // Render loop for smooth lerp on outer ring
    const renderLoop = () => {
      // Linear interpolation (lerp) factor: 0.20 for smooth crisp trailing
      ringPos.current.x += (mousePos.current.x - ringPos.current.x) * 0.22;
      ringPos.current.y += (mousePos.current.y - ringPos.current.y) * 0.22;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mousePos.current.x}px, ${mousePos.current.y}px, 0)`;
      }

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringPos.current.x}px, ${ringPos.current.y}px, 0)`;
      }

      animFrameId.current = requestAnimationFrame(renderLoop);
    };

    animFrameId.current = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('mouseenter', onMouseEnter);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, []);

  if (!isEnabled) return null;

  return (
    <div
      className={`custom-cursor-container ${isVisible ? 'visible' : 'hidden'} ${
        isInteractive ? 'interactive' : ''
      } ${isTextHover ? 'text-mode' : ''} ${isClicking ? 'clicking' : ''}`}
      aria-hidden="true"
    >
      <div ref={dotRef} className="cursor-dot" />
      <div ref={ringRef} className="cursor-ring" />
    </div>
  );
}
