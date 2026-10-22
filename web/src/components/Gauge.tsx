"use client";
// Compliance meter: the needle registers the score with a damped overshoot and keeps a hairline tremor at rest.
import { animate, motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";

const CX = 130, CY = 124, RAD = 104;
const pt = (v: number, r = RAD) => { const a = Math.PI * (1 - v / 100); return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const; };
const arc = (a: number, b: number, r = RAD) => { const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r); return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`; };

export function Gauge({ score, thresholds }: { score: number | null; thresholds: { green: number; yellow: number } }) {
  const reduce = useReducedMotion();
  const v = useMotionValue(reduce ? score ?? 0 : 0), tremor = useMotionValue(0);
  const angle = useTransform(() => -90 + ((Math.max(0, Math.min(100, v.get())) + tremor.get()) / 100) * 180);

  useEffect(() => {
    if (score == null) return;
    if (reduce) { v.set(score); return; }
    const a = animate(v, score, { type: "spring", stiffness: 140, damping: 12, delay: 0.2 });
    return () => a.stop();
  }, [score, reduce, v]);
  useAnimationFrame(t => { if (!reduce) tremor.set(Math.sin(t / 90) * 0.12 + Math.sin(t / 37) * 0.05); });

  const ticks = [];
  for (let k = 0; k <= 100; k += 10) {
    const [x0, y0] = pt(k, RAD - 14), [x1, y1] = pt(k, RAD - (k % 50 ? 20 : 24)), [lx, ly] = pt(k, RAD - 34);
    ticks.push(<g key={k}><line className="tick" x1={x0} y1={y0} x2={x1} y2={y1} />{k % 20 === 0 && <text className="tick-lbl" x={lx} y={ly + 3} textAnchor="middle">{k}</text>}</g>);
  }
  return (
    <svg className="gauge" viewBox="0 0 260 140" role="img" aria-label={score == null ? "Not scored" : `Compliance ${score.toFixed(2)} percent`}>
      <path className="arc-bg" d={arc(0, 100)} fill="none" strokeWidth={1} />
      <path d={arc(0, thresholds.yellow)} fill="none" stroke="var(--red-mark)" strokeWidth={6} />
      <path d={arc(thresholds.yellow, thresholds.green)} fill="none" stroke="var(--amber-mark)" strokeWidth={6} />
      <path d={arc(thresholds.green, 100)} fill="none" stroke="var(--green-mark)" strokeWidth={6} />
      {ticks}
      {score != null && (
        <motion.g style={{ rotate: angle, originX: `${CX}px`, originY: `${CY}px`, transformBox: "view-box" }}>
          <line className="needle" x1={CX} y1={CY + 12} x2={CX} y2={CY - RAD + 6} />
        </motion.g>
      )}
      <circle className="hub" cx={CX} cy={CY} r={5} />
    </svg>
  );
}
