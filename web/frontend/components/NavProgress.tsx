"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [complete, setComplete] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    function onStart() {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      setVisible(true);
      setComplete(false);
    }

    window.addEventListener("app:navigation-start", onStart);
    return () => {
      window.removeEventListener("app:navigation-start", onStart);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;

    frameRef.current = window.requestAnimationFrame(() => {
      setComplete(true);
    });
    timeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      setComplete(false);
    }, 260);

    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [pathname, searchParams, visible]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`h-full origin-left bg-[linear-gradient(90deg,#22d3ee,#3b82f6,#a855f7)] shadow-[0_0_22px_rgba(59,130,246,0.55)] transition-transform duration-300 ease-out ${
          complete ? "scale-x-100" : "scale-x-[0.68]"
        }`}
      />
    </div>
  );
}
