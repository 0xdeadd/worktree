"use client";
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Lesson } from "@/lib/lessons";
import { SANDBOX_TITLE } from "@/lib/lessons";
import { Prose, Inline } from "./Prose";

interface Progress {
  chapter: number; // === lessons.length means "all chapters complete"
  step: number;
}

export function LessonPanel({
  lessons,
  viewChapter,
  progress,
  onSetView,
  onSkipStep,
  onJumpHere,
}: {
  lessons: Lesson[];
  viewChapter: number; // 0..lessons.length (lessons.length === Sandbox)
  progress: Progress;
  onSetView: (i: number) => void;
  onSkipStep: () => void;
  onJumpHere: () => void;
}) {
  const SANDBOX = lessons.length;
  const [hintFor, setHintFor] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  useEffect(() => setHintFor(null), [viewChapter, progress.step, progress.chapter]);

  const isSandboxView = viewChapter === SANDBOX;
  const lesson = isSandboxView ? null : lessons[viewChapter];

  // status of the chapter being viewed
  const chapterDone = !isSandboxView && viewChapter < progress.chapter;
  const chapterLive = !isSandboxView && viewChapter === progress.chapter;
  const chapterLocked = !isSandboxView && viewChapter > progress.chapter;
  const allDone = progress.chapter >= SANDBOX;
  const showDoneCard = chapterDone || (chapterLive && lesson != null && progress.step >= lesson.steps.length);

  // when the viewed chapter changes, jump the panel back to the top
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [viewChapter]);
  // keep the live step (or the completion card) in view as you progress
  useEffect(() => {
    const t = setTimeout(() => {
      if (showDoneCard) doneRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      else liveRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.step, progress.chapter, showDoneCard]);

  return (
    <div className="paper ticks flex h-full flex-col overflow-hidden rounded-md border border-paper-line-bold bg-paper text-ink-text">
      {/* chapter rail ------------------------------------------------------ */}
      <div className="shrink-0 border-b border-paper-line-bold bg-paper-2/60 px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {lessons.map((l, i) => {
            const done = i < progress.chapter;
            const live = i === progress.chapter;
            const active = i === viewChapter;
            return (
              <button
                key={l.id}
                onClick={() => onSetView(i)}
                title={l.title}
                className={`group flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  active ? "border-terra bg-terra text-white" : done ? "border-sage/40 bg-sage/10 text-sage hover:border-sage" : live ? "task-live border-mustard bg-mustard/15 text-[#8a6210] hover:bg-mustard/25" : "border-paper-line text-ink-text-dim hover:border-ink-text-dim hover:text-ink-text"
                }`}
              >
                <span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] ${active ? "bg-white/25" : done ? "bg-sage/20" : live ? "bg-mustard/25" : "bg-paper-line/60"}`}>{done ? "✓" : i + 1}</span>
                <span className="max-w-[7.5rem] truncate">{l.title}</span>
              </button>
            );
          })}
          <button
            onClick={() => onSetView(SANDBOX)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              isSandboxView ? "border-slate bg-slate text-white" : "border-paper-line text-ink-text-dim hover:border-slate hover:text-slate"
            }`}
          >
            <span className="text-[12px] leading-none">∞</span> Sandbox
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[10px] leading-snug text-ink-text-dim">
          {isSandboxView ? "No rules here — type anything. " : "Follow the ▸ step. Stuck? open the hint. "}
          <button onClick={() => onSetView(isSandboxView ? Math.min(progress.chapter, SANDBOX - 1) : SANDBOX)} className="underline decoration-dotted underline-offset-2 hover:text-terra">
            {isSandboxView ? "back to the manual" : "or just mess around in the Sandbox"}
          </button>
        </p>
      </div>

      {/* body ------------------------------------------------------------- */}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isSandboxView ? (
          <SandboxBody allDone={allDone} />
        ) : (
          <>
            <header className="mb-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-terra">
                Chapter {viewChapter + 1} / {lessons.length}
              </div>
              <h2 className="mt-0.5 text-[1.5rem] leading-tight text-ink-text" style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
                {lesson!.title}
              </h2>
              <div className="mt-0.5 font-mono text-[11px] text-ink-text-dim">{lesson!.blurb}</div>
            </header>

            {chapterLocked && (
              <div className="mb-4 rounded-md border border-mustard/50 bg-mustard/10 px-3 py-2.5 text-[12.5px] text-[#7a5a10]">
                You haven&apos;t reached this chapter yet. You can read ahead — or{" "}
                <button onClick={onJumpHere} className="font-semibold underline decoration-2 underline-offset-2 hover:text-terra">
                  skip ahead to here
                </button>
                .
              </div>
            )}

            <Prose text={lesson!.intro} className="text-[13.5px] leading-relaxed text-ink-text/90" />

            {/* steps */}
            <ol className="mt-5 space-y-2.5">
              {lesson!.steps.map((s, i) => {
                const stepDone = chapterDone || (chapterLive && i < progress.step) || (allDone && viewChapter === SANDBOX - 1);
                const stepLive = chapterLive && i === progress.step && !chapterDone;
                return (
                  <li key={i}>
                    <div
                      ref={stepLive ? liveRef : undefined}
                      className={`flex gap-2.5 rounded-md border px-3 py-2.5 transition-colors ${
                        stepLive ? "task-live border-mustard bg-mustard/[0.12]" : stepDone ? "border-sage/30 bg-sage/[0.07]" : "border-paper-line bg-paper-2/40"
                      }`}
                    >
                      <span className={`mt-[1px] grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] ${stepDone ? "bg-sage text-white" : stepLive ? "bg-mustard text-white" : "bg-paper-line text-ink-text-dim"}`}>{stepDone ? "✓" : i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-[13px] leading-snug ${stepDone ? "text-ink-text-dim line-through decoration-sage/40" : "text-ink-text"}`}>
                          {stepLive && <span className="mr-1 font-semibold text-terra">▸</span>}
                          <Inline text={s.prompt} />
                        </div>
                        {stepLive && (
                          <div className="mt-1.5 flex items-center gap-3 font-mono text-[10.5px]">
                            <button onClick={() => setHintFor(hintFor === i ? null : i)} className="text-mustard underline decoration-dotted underline-offset-2 hover:text-terra">
                              {hintFor === i ? "hide hint" : "show hint"}
                            </button>
                            <button onClick={onSkipStep} className="text-ink-text-dim underline decoration-dotted underline-offset-2 hover:text-terra">
                              skip this step
                            </button>
                          </div>
                        )}
                        <AnimatePresence>
                          {stepLive && hintFor === i && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.22 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 border-l-2 border-mustard/60 pl-2.5 text-[12px] leading-relaxed text-ink-text-dim">
                                <Inline text={s.hint} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* done card */}
            {showDoneCard && (
              <motion.div ref={doneRef} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-md border border-sage/50 bg-sage/[0.1] p-4">
                <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-sage">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-sage text-[9px] text-white">✓</span> chapter complete
                </div>
                <Prose text={lesson!.done} className="text-[13px] leading-relaxed text-ink-text/90" />
                <div className="mt-3">
                  {viewChapter + 1 < lessons.length ? (
                    <button onClick={() => onSetView(viewChapter + 1)} className="rounded-md bg-terra px-3.5 py-1.5 font-mono text-[12px] text-white transition-colors hover:bg-terra-bright">
                      Next chapter ▸ {lessons[viewChapter + 1].title}
                    </button>
                  ) : (
                    <button onClick={() => onSetView(SANDBOX)} className="rounded-md bg-slate px-3.5 py-1.5 font-mono text-[12px] text-white transition-colors hover:opacity-90">
                      ▸ Enter the Sandbox — go break things
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* progress bar ----------------------------------------------------- */}
      <div className="shrink-0 border-t border-paper-line-bold bg-paper-2/60 px-4 py-2">
        <div className="flex items-center justify-between font-mono text-[10px] text-ink-text-dim">
          <span>{allDone ? "all chapters complete" : `chapter ${Math.min(progress.chapter + 1, lessons.length)} of ${lessons.length}`}</span>
          <span>{Math.round((Math.min(progress.chapter, lessons.length) / lessons.length) * 100)}%</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-paper-line/70">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-mustard to-terra" animate={{ width: `${(Math.min(progress.chapter, lessons.length) / lessons.length) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
        </div>
      </div>
    </div>
  );
}

function SandboxBody({ allDone }: { allDone: boolean }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate">∞ free play</div>
      <h2 className="mt-0.5 text-[1.5rem] leading-tight text-ink-text" style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
        {SANDBOX_TITLE}
      </h2>
      <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-text/90">
        <p>
          {allDone ? "You finished the manual — nice. " : ""}
          This is yours. No steps, no checks, nothing to lose. Branch wildly. <code className="prose-paper">git merge</code> things. <code className="prose-paper">git reset --hard</code> and then <code className="prose-paper">git reflog</code> your way back. Set up a fake <code className="prose-paper">origin</code> and <code className="prose-paper">git push</code>. The graph on the right and the readout below update live.
        </p>
        <p className="text-ink-text-dim">
          Everything here is the <em>real</em> git command surface — the same words work in a real terminal. The difference is just the blast radius: zero.
        </p>
        <div className="rounded-md border border-paper-line bg-paper-2/50 p-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-text-dim">try, for instance</div>
          <pre className="prose-paper whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-ink-text">{`git init
echo "hello" > readme.md
git add . && git commit -m "first"
git checkout -b experiment
echo "wild idea" > idea.txt
git add . && git commit -m "an experiment"
git switch main
git merge experiment
git tag v1.0
git reset --hard HEAD~2     # uh oh
git reflog                  # ...phew
type  help  any time`}</pre>
        </div>
        <p className="font-mono text-[11px] text-ink-text-dim">(↶ undo in the terminal title bar rewinds the whole sandbox a step at a time. ⟲ reset wipes it.)</p>
      </div>
    </div>
  );
}
