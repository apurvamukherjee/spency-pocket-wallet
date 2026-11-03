"use client";

import { type ReactNode, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

const THRESHOLD = 96;

/** Swipe right to confirm, left to reject. Vertical drags pass through to page scroll (touch-action: pan-y). */
export function SwipeCard({
  onConfirm,
  onReject,
  children,
}: {
  onConfirm: () => void;
  onReject: () => void;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<1 | -1 | 0>(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    if (!moved.current) {
      if (Math.abs(x) < 8) return;
      if (Math.abs(y) > Math.abs(x)) {
        start.current = null;
        return;
      }
      moved.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDx(x);
  }

  function onPointerUp() {
    start.current = null;
    setDragging(false);
    if (Math.abs(dx) <= THRESHOLD) return setDx(0);
    // No transition runs under reduced motion, so transitionend would never fire.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return dx > 0 ? onConfirm() : onReject();
    setLeaving(dx > 0 ? 1 : -1);
  }

  const offset = leaving ? leaving * 480 : dx;
  const progress = Math.min(1, Math.abs(dx) / THRESHOLD);

  return (
    <div className="relative overflow-hidden rounded-[20px]">
      <div
        aria-hidden
        className={`absolute inset-0 flex items-center px-6 ${dx >= 0 ? "justify-start bg-ok/15 text-ok" : "justify-end bg-bad/15 text-bad"}`}
        style={{ opacity: leaving ? 1 : progress }}
      >
        <Icon name={dx >= 0 ? "check" : "x"} size={22} />
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          // A drag that ends over the card must not also count as a tap.
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
        onTransitionEnd={(e) => {
          if (e.target !== e.currentTarget) return;
          if (leaving === 1) onConfirm();
          if (leaving === -1) onReject();
        }}
        className={`relative touch-pan-y select-none ${dragging ? "" : "transition-transform duration-300 ease-out-soft"}`}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
