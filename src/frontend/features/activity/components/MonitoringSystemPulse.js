"use client";

import { useEffect, useRef } from "react";
import { Laptop, ShieldCheck, UsersRound } from "lucide-react";

export default function MonitoringSystemPulse({ emphasis = "healthy" }) {
  const sceneRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); }, []);

  function move(event) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !sceneRef.current) return;
    const bounds = sceneRef.current.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 12;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 10;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      sceneRef.current?.style.setProperty("--pulse-x", `${x}px`);
      sceneRef.current?.style.setProperty("--pulse-y", `${y}px`);
    });
  }

  function reset() {
    if (!sceneRef.current) return;
    sceneRef.current.style.setProperty("--pulse-x", "0px");
    sceneRef.current.style.setProperty("--pulse-y", "0px");
  }

  return <div ref={sceneRef} onPointerMove={move} onPointerLeave={reset} className={`monitoring-pulse monitoring-pulse--${emphasis}`} aria-hidden="true">
    <div className="monitoring-pulse__link monitoring-pulse__link--one" />
    <div className="monitoring-pulse__link monitoring-pulse__link--two" />
    <div className="monitoring-pulse__core"><ShieldCheck className="h-9 w-9" /></div>
    <div className="monitoring-pulse__node monitoring-pulse__node--people"><UsersRound className="h-5 w-5" /></div>
    <div className="monitoring-pulse__node monitoring-pulse__node--device"><Laptop className="h-5 w-5" /></div>
    <span className="monitoring-pulse__dot monitoring-pulse__dot--healthy" />
    <span className="monitoring-pulse__dot monitoring-pulse__dot--attention" />
    <span className="monitoring-pulse__label">Live system health</span>
  </div>;
}
