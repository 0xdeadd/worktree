"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitRepo, tokenize, type OutLine } from "@/lib/git/engine";
import { buildGraph } from "@/lib/graph";
import { LESSONS } from "@/lib/lessons";
import { Terminal } from "@/components/Terminal";
import { CommitGraph } from "@/components/CommitGraph";
import { StatePanel } from "@/components/StatePanel";
import { LessonPanel } from "@/components/LessonPanel";

const SANDBOX = LESSONS.length;

const WELCOME: OutLine[] = [
  { text: "worktree — a hands-on git manual", kind: "note" },
  { text: "A safe sandbox. Type real git commands; nothing here touches a real repository.", kind: "out" },
  { text: "New here? Follow the ▸ step in the panel on the left. Type  help  for every command.", kind: "hint" },
  { text: "", kind: "out" },
];

interface UndoEntry {
  snap: string;
  cmd: string;
  chapter: number;
  step: number;
  baseline: unknown;
}

export default function Page() {
  const repoRef = useRef<GitRepo | null>(null);
  if (repoRef.current === null) repoRef.current = new GitRepo();
  const repo = repoRef.current;

  const [tick, setTick] = useState(0);
  const [lines, setLines] = useState<OutLine[]>(WELCOME);
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const [progress, setProgress] = useState({ chapter: 0, step: 0 });
  const [viewChapter, setViewChapter] = useState(0);
  const baselineRef = useRef<unknown>(undefined);

  // capture the baseline the moment the live step changes
  useEffect(() => {
    if (progress.chapter >= SANDBOX) {
      baselineRef.current = undefined;
      return;
    }
    const step = LESSONS[progress.chapter]?.steps[progress.step];
    baselineRef.current = step?.baseline ? step.baseline(repoRef.current!) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.chapter, progress.step]);

  const advanceProgress = useCallback(() => {
    setProgress((p) => {
      if (p.chapter >= SANDBOX) return p;
      const lesson = LESSONS[p.chapter];
      return p.step + 1 < lesson.steps.length ? { chapter: p.chapter, step: p.step + 1 } : { chapter: p.chapter + 1, step: 0 };
    });
  }, []);

  const doReset = useCallback(() => {
    repoRef.current = new GitRepo();
    baselineRef.current = undefined;
    setLines([...WELCOME, { text: "(sandbox reset — fresh repository)", kind: "note" }]);
    setUndo([]);
    setProgress({ chapter: 0, step: 0 });
    setViewChapter(0);
    setTick((t) => t + 1);
  }, []);

  const onRun = useCallback(
    (line: string) => {
      const r = repoRef.current!;
      const raw = line.trim();
      if (!raw) return;
      const pre: UndoEntry = { snap: r.snapshot(), cmd: raw, chapter: progress.chapter, step: progress.step, baseline: baselineRef.current };
      const res = r.run(raw);
      if (res.resetSandbox) {
        doReset();
        return;
      }
      setLines((ls) => (res.clear ? [] : [...ls, ...res.lines]));
      if (res.changed) setUndo((u) => [...u, pre].slice(-250));
      setTick((t) => t + 1);
      // lesson progression — only when the learner is actually on the live chapter
      if (viewChapter === progress.chapter && progress.chapter < SANDBOX) {
        const tokens = tokenize(raw);
        const ctx = { cmd: raw, tokens, output: res.lines, errored: !!res.errored };
        const passes = (s: (typeof LESSONS)[number]["steps"][number], baseline: unknown) => {
          try {
            return s.check(r, ctx, baseline);
          } catch {
            return false;
          }
        };
        const startChapter = progress.chapter;
        let ch = progress.chapter;
        let st = progress.step;
        for (let guard = 0; guard < 60 && ch < SANDBOX; guard++) {
          const lesson = LESSONS[ch];
          const step = lesson.steps[st];
          if (!step) break;
          const baseline = ch === startChapter && st === progress.step ? baselineRef.current : undefined;
          const passNow = passes(step, baseline);
          // within the chapter you're actually on, also skip earlier steps if a *later*
          // one is already satisfied (you did the thing a different way) — but never let
          // that skip-ahead cascade into chapters you've only just rolled into.
          const leapt = ch === startChapter && !passNow && lesson.steps.slice(st + 1).some((s2) => passes(s2, undefined));
          if (!passNow && !leapt) break;
          st++;
          if (st >= lesson.steps.length) {
            ch++;
            st = 0;
          }
        }
        if (ch !== progress.chapter || st !== progress.step) setProgress({ chapter: ch, step: st });
      }
    },
    [progress, viewChapter, doReset],
  );

  const onUndo = useCallback(() => {
    if (!undo.length) return;
    const last = undo[undo.length - 1];
    repoRef.current!.restore(last.snap);
    baselineRef.current = last.baseline;
    setProgress({ chapter: last.chapter, step: last.step });
    setLines((ls) => [...ls, { text: `↶ undid: ${last.cmd}`, kind: "note" }]);
    setUndo((u) => u.slice(0, -1));
    setTick((t) => t + 1);
  }, [undo]);

  const onReset = useCallback(() => {
    if (typeof window !== "undefined" && !window.confirm("Wipe the sandbox and start over? (Lesson progress resets too.)")) return;
    doReset();
  }, [doReset]);

  const onSkipStep = useCallback(() => advanceProgress(), [advanceProgress]);
  const onJumpHere = useCallback(() => setProgress({ chapter: viewChapter, step: 0 }), [viewChapter]);

  // derived state — recomputed whenever `tick` changes
  const layout = useMemo(() => buildGraph(repoRef.current!), [tick]);
  const prompt = useMemo(() => {
    const x = repoRef.current!;
    let suffix = "";
    if (x.initialized) suffix = x.head.type === "branch" ? ` (${x.head.name})` : ` ((${x.head.oid}))`;
    return `~/project${suffix} $`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  void tick; // (Page re-renders on every tick, so the mutable `repo` reads below are fresh)
  const detached = repo.head.type === "detached";

  return (
    <div className="flex min-h-screen flex-col xl:h-screen xl:overflow-hidden">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-ink-line bg-ink-2/60 px-4 py-2.5 sm:px-6">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[1.75rem] leading-none text-cream" style={{ fontVariationSettings: '"SOFT" 70, "WONK" 1, "opsz" 36' }}>
            worktree
          </h1>
          <span className="hidden font-mono text-[11px] tracking-wide text-cream-faint sm:inline">— learn git &amp; github by doing —</span>
        </div>
        <p className="hidden flex-1 text-[12.5px] text-cream-dim lg:block">
          Type real git commands in a safe sandbox &amp; watch the commit graph move. <span className="text-cream">Branch, merge, undo, push — there&apos;s nothing to lose.</span>
        </p>
        <div className="ml-auto flex items-center gap-3 font-mono text-[11px] text-cream-faint">
          <span className="hidden xl:inline">a simulation, not a real repo</span>
          <span className="hidden xl:inline text-ink-line-2">·</span>
          <span>by Clint Phillips</span>
        </div>
      </header>

      {/* ── workspace ──────────────────────────────────────────────────── */}
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 xl:grid-cols-[minmax(330px,28%)_minmax(0,1fr)_minmax(360px,30%)]">
        <section className="rise h-[58vh] min-h-0 xl:h-full" style={{ animationDelay: "0ms" }}>
          <LessonPanel lessons={LESSONS} viewChapter={viewChapter} progress={progress} onSetView={setViewChapter} onSkipStep={onSkipStep} onJumpHere={onJumpHere} />
        </section>

        <section className="rise h-[62vh] min-h-0 xl:h-full" style={{ animationDelay: "90ms" }}>
          <Terminal lines={lines} onRun={onRun} prompt={prompt} onUndo={onUndo} canUndo={undo.length > 0} onReset={onReset} />
        </section>

        <section className="rise flex min-h-0 flex-col gap-3 xl:h-full" style={{ animationDelay: "180ms" }}>
          <div className="h-[46vh] min-h-0 xl:h-auto xl:flex-[1.4]">
            <CommitGraph layout={layout} detached={detached} />
          </div>
          <div className="h-[42vh] min-h-0 xl:h-auto xl:flex-1">
            <StatePanel repo={repo} layout={layout} />
          </div>
        </section>
      </main>
    </div>
  );
}
