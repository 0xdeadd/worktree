"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OutLine, OutKind } from "@/lib/git/engine";

const KIND_CLASS: Record<OutKind, string> = {
  cmd: "text-cream",
  out: "text-cream-dim",
  err: "text-terra-bright",
  ok: "text-sage-bright",
  hint: "text-mustard/90 italic",
  note: "text-slate",
};

const GIT_SUBS = ["init", "status", "add", "commit", "log", "branch", "checkout", "switch", "merge", "tag", "reset", "restore", "revert", "cherry-pick", "stash", "reflog", "diff", "remote", "push", "pull", "fetch", "config", "rm"];

export function Terminal({
  lines,
  onRun,
  prompt,
  onUndo,
  canUndo,
  onReset,
}: {
  lines: OutLine[];
  onRun: (line: string) => void;
  prompt: string;
  onUndo: () => void;
  canUndo: boolean;
  onReset: () => void;
}) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const v = value;
    if (!v.trim()) {
      setValue("");
      return;
    }
    onRun(v);
    setHistory((h) => (h[h.length - 1] === v ? h : [...h, v]));
    setHIdx(null);
    setValue("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const next = hIdx === null ? history.length - 1 : Math.max(0, hIdx - 1);
      setHIdx(next);
      setValue(history[next]);
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(99, 99));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hIdx === null) return;
      const next = hIdx + 1;
      if (next >= history.length) {
        setHIdx(null);
        setValue("");
      } else {
        setHIdx(next);
        setValue(history[next]);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const parts = value.split(/\s+/);
      if (parts.length === 2 && parts[0] === "git") {
        const hit = GIT_SUBS.filter((s) => s.startsWith(parts[1]));
        if (hit.length === 1) setValue("git " + hit[0] + " ");
      } else if (parts.length === 1) {
        const all = ["git", "echo", "touch", "cat", "ls", "rm", "clear", "help", "pwd"];
        const hit = all.filter((s) => s.startsWith(parts[0]));
        if (hit.length === 1) setValue(hit[0] + " ");
      }
    } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onRun("clear");
    }
  }

  return (
    <div className="screen flex h-full flex-col overflow-hidden rounded-md border border-ink-line shadow-[0_2px_30px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.04)]">
      {/* title bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-line bg-ink-3/70 px-3 py-1.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-terra/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-mustard/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-sage/60" />
        </span>
        <span className="ml-1 font-mono text-[11px] tracking-wide text-cream-faint">— bash — worktree sandbox —</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo the last command (sandbox-level rewind)"
            className="rounded border border-ink-line px-1.5 py-0.5 font-mono text-[10.5px] text-cream-dim transition-colors hover:enabled:border-mustard hover:enabled:text-mustard disabled:opacity-30"
          >
            ↶ undo
          </button>
          <button
            onClick={onReset}
            title="Wipe the sandbox and start over"
            className="rounded border border-ink-line px-1.5 py-0.5 font-mono text-[10.5px] text-cream-dim transition-colors hover:border-terra hover:text-terra-bright"
          >
            ⟲ reset
          </button>
        </span>
      </div>

      {/* scrollback + input */}
      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 cursor-text overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[1.55] [tab-size:4] selection:bg-terra/70"
      >
        {lines.map((l, i) =>
          l.kind === "cmd" ? (
            <div key={i} className="mt-1.5 whitespace-pre-wrap break-words first:mt-0">
              <span className="select-none text-sage/80">{prompt}&nbsp;</span>
              <span className="text-cream">{l.text}</span>
            </div>
          ) : (
            <div key={i} className={`whitespace-pre-wrap break-words ${KIND_CLASS[l.kind]}`}>
              {l.text || " "}
            </div>
          ),
        )}
        {/* live input line */}
        <div className="mt-1.5 flex items-baseline whitespace-pre-wrap break-words">
          <span className="select-none text-sage/80">{prompt}&nbsp;</span>
          <span className="relative flex-1">
            <span className="text-cream">{value}</span>
            <span className="cursor" />
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              aria-label="terminal input"
              className="absolute inset-0 w-full bg-transparent font-mono text-transparent caret-transparent outline-none"
            />
          </span>
        </div>
      </div>
    </div>
  );
}
