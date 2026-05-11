# worktree

**A hands-on git manual.** Type real git commands in a safe in-browser sandbox and watch the commit graph move — branch, merge, undo, push. Nothing touches a real repository, so there's nothing to lose.

[**git.clintphillips.dev**](https://git.clintphillips.dev) · built with Next.js + Tailwind + Motion

## What it is

A small **git engine that runs entirely in the browser** (commits, branches, `HEAD`, the index, the working directory, lightweight tags, a pretend `origin` remote) wired to:

- an **interactive terminal** that accepts real git syntax (`git init`, `add`, `commit`, `branch`, `checkout`/`switch`, `merge`, `reset`, `restore`, `revert`, `reflog`, `tag`, `remote`, `push`, …) plus a tiny shell (`echo > file`, `touch`, `cat`, `ls`, `rm`, `&&` chaining)
- a **live commit graph** that lays the DAG out into lanes the way a git viewer would — new commits drop in, branches sprout, merges weave, refs slide around
- a **7-chapter guided manual** (first repo → history → branches → merging → undo/`reflog` → GitHub remotes → tags) that checks your repo state as you go, with hints and a no-rules Sandbox mode
- a **sandbox-level undo** (`↶`) that rewinds the whole thing a command at a time

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build && npm start   # production
```

Deploy: `vercel --prod` (it's a fully static client-side app).

## Layout

```
app/            Next.js app router — layout (fonts), page (orchestrator), globals.css (design tokens)
lib/git/        the git engine (engine.ts)
lib/graph.ts    DAG → (col,row) lane layout
lib/lessons.ts  the curriculum
components/      Terminal · CommitGraph · StatePanel · LessonPanel · Prose
```

The engine is intentionally simplified for teaching: no real content diffs, no merge conflicts. Everything else behaves like the real thing.
