"use client";
import React, { useMemo } from "react";
import type { GitRepo } from "@/lib/git/engine";
import type { GraphLayout } from "@/lib/graph";
import { laneColor } from "@/lib/graph";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="rule-double mb-2 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-text-dim">{children}</div>;
}

export function StatePanel({ repo, layout }: { repo: GitRepo; layout: GraphLayout }) {
  const colByOid = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of layout.nodes) m.set(n.oid, n.col);
    return m;
  }, [layout]);
  const colorOf = (oid: string | null | undefined) => (oid && colByOid.has(oid) ? laneColor(colByOid.get(oid)!) : "#9a8c6c");

  const headOid = repo.headOid();
  const headCommit = repo.headCommit();
  const branchName = repo.headBranch();
  const detached = repo.head.type === "detached";
  const branches = repo.branchList();
  const tags = Object.entries(repo.tags);
  const st = repo.status();

  return (
    <div className="paper ticks flex h-full flex-col gap-4 overflow-auto rounded-md border border-paper-line-bold bg-paper p-4 text-ink-text">
      {/* HEAD ----------------------------------------------------------- */}
      <div>
        <SectionLabel>HEAD · you are here</SectionLabel>
        {!repo.initialized ? (
          <p className="font-mono text-[12px] text-ink-text-dim">no repository yet — <span className="text-ink-text">git init</span></p>
        ) : (
          <div className="flex items-start gap-2">
            <span className="mt-[3px] inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: detached ? "#c8553d" : colorOf(headOid) }} />
            <div className="min-w-0">
              <div className="font-mono text-[12.5px] leading-tight">
                {detached ? (
                  <>
                    <span className="text-terra">detached</span> @ <span className="text-ink-text">{headOid}</span>
                  </>
                ) : (
                  <>
                    on branch <span className="font-semibold text-ink-text">{branchName}</span>
                  </>
                )}
              </div>
              {headCommit ? (
                <div className="mt-0.5 truncate font-mono text-[11px] text-ink-text-dim" title={headCommit.message}>
                  {headCommit.oid} · {headCommit.message}
                </div>
              ) : (
                <div className="mt-0.5 font-mono text-[11px] text-ink-text-dim">no commits yet</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* BRANCHES ------------------------------------------------------- */}
      {repo.initialized && (branches.length > 0 || tags.length > 0) && (
        <div>
          <SectionLabel>refs</SectionLabel>
          <ul className="space-y-1 font-mono text-[12px]">
            {branches.map((b) => {
              const up = repo.upstream[b.name];
              const synced = up && repo.remoteRefs[up] === b.oid;
              return (
                <li key={b.name} className="flex items-center gap-2">
                  <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center">
                    {b.current ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(b.oid) }} /> : <span className="h-2.5 w-2.5 rounded-full border" style={{ borderColor: colorOf(b.oid) }} />}
                  </span>
                  <span className={b.current ? "font-semibold text-ink-text" : "text-ink-text-dim"}>{b.name}</span>
                  {b.current && <span className="text-[10px] text-terra">← HEAD</span>}
                  <span className="text-ink-text-dim/60">{b.oid}</span>
                  {up && <span className={`ml-auto text-[10px] ${synced ? "text-sage" : "text-mustard"}`}>{synced ? "✓ " + up : "⇡ ahead of " + up}</span>}
                </li>
              );
            })}
            {tags.map(([n, oid]) => (
              <li key={"tag" + n} className="flex items-center gap-2 text-ink-text-dim">
                <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center text-mustard">⌖</span>
                <span>{n}</span>
                <span className="text-ink-text-dim/60">{oid}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* WORKING TREE --------------------------------------------------- */}
      {repo.initialized && (
        <div>
          <SectionLabel>working tree</SectionLabel>
          {st.staged.length === 0 && st.notStaged.length === 0 && st.untracked.length === 0 ? (
            <p className="font-mono text-[12px] text-sage">✓ clean — nothing to commit</p>
          ) : (
            <div className="space-y-2 font-mono text-[11.5px]">
              {st.staged.length > 0 && (
                <div>
                  <div className="mb-0.5 text-[10px] uppercase tracking-wider text-sage">staged · ready to commit</div>
                  <ul>
                    {st.staged.map((f) => (
                      <li key={"s" + f.file} className="flex gap-2 text-sage">
                        <span className="w-[3.6rem] shrink-0 text-sage/70">{f.how === "new" ? "new" : f.how === "deleted" ? "deleted" : "modified"}</span>
                        <span className="text-ink-text">{f.file}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {st.notStaged.length > 0 && (
                <div>
                  <div className="mb-0.5 text-[10px] uppercase tracking-wider text-terra">changed · not staged</div>
                  <ul>
                    {st.notStaged.map((f) => (
                      <li key={"n" + f.file} className="flex gap-2 text-terra">
                        <span className="w-[3.6rem] shrink-0 text-terra/70">{f.how === "deleted" ? "deleted" : "modified"}</span>
                        <span className="text-ink-text">{f.file}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {st.untracked.length > 0 && (
                <div>
                  <div className="mb-0.5 text-[10px] uppercase tracking-wider text-ink-text-dim">untracked</div>
                  <ul>
                    {st.untracked.map((f) => (
                      <li key={"u" + f} className="flex gap-2 text-ink-text-dim">
                        <span className="w-[3.6rem] shrink-0">??</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {/* a small files-on-disk readout */}
          {Object.keys(repo.workdir).length > 0 && (
            <div className="mt-2 border-t border-paper-line pt-1.5 font-mono text-[10.5px] text-ink-text-dim">
              files: {Object.keys(repo.workdir).sort().join("  ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
