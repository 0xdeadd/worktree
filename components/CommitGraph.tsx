"use client";
import React, { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { GraphLayout, GraphNode } from "@/lib/graph";
import { laneColor } from "@/lib/graph";

const COL_W = 26;
const ROW_H = 40;
const PAD_L = 22;
const PAD_T = 26;
const R = 5.5;

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(x1 - x2) < 0.5) return `M${x1},${y1} L${x2},${y2}`;
  const dy = y2 - y1;
  return `M${x1},${y1} C${x1},${y1 + dy * 0.45} ${x2},${y2 - dy * 0.45} ${x2},${y2}`;
}

function Chip({ label, variant, color }: { label: string; variant: "head" | "branch" | "branch-current" | "tag" | "remote"; color: string }) {
  const base = "inline-flex items-center rounded-[4px] px-1.5 py-[1px] font-mono text-[10.5px] font-medium leading-[1.35] whitespace-nowrap";
  if (variant === "head")
    return <span className={`${base} bg-terra text-[#fff] shadow-[0_1px_0_rgba(0,0,0,0.15)]`}>{label}</span>;
  if (variant === "tag")
    return (
      <span className={`${base} border border-mustard/70 bg-mustard/15 text-[#9a7416]`}>
        <span className="mr-1 opacity-60">⌖</span>
        {label}
      </span>
    );
  if (variant === "remote")
    return (
      <span className={`${base} border border-dashed border-slate/70 bg-slate/10 text-[#3f5e74]`}>
        <span className="mr-1 opacity-70">☁</span>
        {label}
      </span>
    );
  if (variant === "branch-current")
    return (
      <span className={`${base} text-[#fff]`} style={{ backgroundColor: color }}>
        {label}
      </span>
    );
  return (
    <span className={`${base} border bg-white/30`} style={{ borderColor: color, color: shade(color) }}>
      {label}
    </span>
  );
}
// darken a hex for legible text on the cream paper
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.62);
  const g = Math.round(((n >> 8) & 255) * 0.62);
  const b = Math.round((n & 255) * 0.62);
  return `rgb(${r},${g},${b})`;
}

export function CommitGraph({ layout, detached }: { layout: GraphLayout; detached: boolean }) {
  const { nodes, edges, cols, rows } = layout;
  const graphW = PAD_L + Math.max(cols, 1) * COL_W;
  const svgH = PAD_T * 2 + Math.max(rows - 1, 0) * ROW_H;
  const xy = useMemo(() => {
    const m = new Map<string, { x: number; y: number; node: GraphNode }>();
    for (const n of nodes) m.set(n.oid, { x: PAD_L + n.col * COL_W, y: PAD_T + n.row * ROW_H, node: n });
    return m;
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="graph-paper flex h-full items-center justify-center rounded-md border border-paper-line-bold p-6 text-center">
        <p className="prose-paper max-w-[15rem] text-[12.5px] leading-relaxed text-ink-text-dim">
          No commits yet.
          <br />
          <span className="text-ink-text">Try: </span>
          <code>git init</code> → <code>echo &quot;hi&quot; &gt; readme.md</code> → <code>git add .</code> → <code>git commit -m &quot;first&quot;</code>
        </p>
      </div>
    );
  }

  return (
    <div className="graph-paper h-full overflow-auto rounded-md border border-paper-line-bold">
      <div className="relative" style={{ minWidth: "100%", height: svgH + PAD_T }}>
        {/* edges + dots */}
        <svg width={graphW} height={svgH} className="absolute left-0 top-0 overflow-visible">
          <AnimatePresence>
            {edges.map((e) => {
              const a = xy.get(e.from);
              const b = xy.get(e.to);
              if (!a || !b) return null;
              return (
                <motion.path
                  key={`${e.from}-${e.to}`}
                  d={edgePath(a.x, a.y, b.x, b.y)}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.85 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              );
            })}
          </AnimatePresence>
          <AnimatePresence>
            {nodes.map((n) => {
              const p = xy.get(n.oid)!;
              const c = laneColor(n.col);
              return (
                <motion.g
                  key={n.oid}
                  initial={{ opacity: 0, scale: 0, x: p.x, y: p.y }}
                  animate={{ opacity: 1, scale: 1, x: p.x, y: p.y }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ type: "spring", stiffness: 600, damping: 32, mass: 0.5 }}
                >
                  {n.isHead && <circle r={R + 4.5} fill="none" stroke="#c8553d" strokeWidth={1.5} opacity={0.95} />}
                  <circle r={n.isMerge ? R + 1.5 : R} fill={c} stroke="#f1e8d6" strokeWidth={1.5} />
                  {n.isMerge && <circle r={1.6} fill="#f1e8d6" />}
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>

        {/* text rows: oid · message · ref chips — absolutely placed beside the graph */}
        {nodes.map((n) => {
          const p = xy.get(n.oid)!;
          const headChip = n.isHead ? (detached ? "HEAD (detached)" : "HEAD") : null;
          const branchRefs = n.refs.filter((r) => r.kind === "head" || r.kind === "branch");
          const remoteRefs = n.refs.filter((r) => r.kind === "remote");
          const tagRefs = n.refs.filter((r) => r.kind === "tag");
          return (
            <motion.div
              key={n.oid}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute flex items-center gap-1.5 pr-3"
              style={{ top: p.y - 9, left: graphW + 14, transition: "top 0.28s ease" }}
            >
              <code className="shrink-0 font-mono text-[11px] tracking-tight text-ink-text-dim">{n.oid}</code>
              <span className="max-w-[12rem] shrink truncate font-mono text-[11.5px] text-ink-text" title={n.message}>
                {n.message}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {headChip && <Chip label={headChip} variant="head" color="#c8553d" />}
                {branchRefs.map((r) => (
                  <Chip key={"b" + r.name} label={r.name} variant={r.kind === "head" ? "branch-current" : "branch"} color={laneColor(n.col)} />
                ))}
                {remoteRefs.map((r) => (
                  <Chip key={"r" + r.name} label={r.name} variant="remote" color="#6685a0" />
                ))}
                {tagRefs.map((r) => (
                  <Chip key={"t" + r.name} label={r.name} variant="tag" color="#cf9b3f" />
                ))}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
