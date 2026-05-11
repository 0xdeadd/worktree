// A small, teaching-grade git engine that runs entirely in the browser.
// It models commits, branches, HEAD, the index (staging area), the working
// directory, lightweight tags, and a single magic remote called "origin".
// It is intentionally simplified: no real content diffs, no merge conflicts.

export type Oid = string;

export interface Commit {
  oid: Oid;
  message: string;
  parents: Oid[];
  tree: Record<string, string>; // filename -> content snapshot
  author: string;
  time: number; // wall-clock-ish for display
  seq: number; // creation order; a parent always has a lower seq than its child
}

export type Head =
  | { type: "branch"; name: string } // normal: HEAD -> refs/heads/<name>
  | { type: "detached"; oid: Oid }; // detached HEAD

export interface ReflogEntry {
  oid: Oid | null; // where HEAD pointed after this action ("null" before first commit)
  action: string; // "commit", "checkout", "reset", "merge", ...
  message: string;
  seq: number;
}

export type OutKind = "cmd" | "out" | "err" | "hint" | "ok" | "note";
export interface OutLine {
  text: string;
  kind: OutKind;
}
export interface RunResult {
  lines: OutLine[];
  changed: boolean; // did repo state change (worth pushing an undo snapshot)
  clear?: boolean; // terminal asked to be cleared
  resetSandbox?: boolean; // user asked to wipe everything
  errored?: boolean; // the (last) command failed — stops `&&` chains
}

// ---------------------------------------------------------------------------

function shortHash(existing: Set<string>): Oid {
  let h: string;
  do {
    h = Math.floor(Math.random() * 0xfffffff)
      .toString(16)
      .padStart(7, "0")
      .slice(0, 7);
  } while (existing.has(h));
  return h;
}

// quote-aware tokenizer ("commit -m \"hello world\"" -> ["commit","-m","hello world"])
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      has = true;
    } else if (ch === " " || ch === "\t") {
      if (has) {
        out.push(cur);
        cur = "";
        has = false;
      }
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------

export class GitRepo {
  initialized = false;
  commits: Record<Oid, Commit> = {};
  refs: Record<string, Oid> = {}; // branch name -> oid
  tags: Record<string, Oid> = {};
  remoteRefs: Record<string, Oid> = {}; // "origin/main" -> oid
  remoteUrl: string | null = null;
  upstream: Record<string, string> = {}; // branch -> "origin/branch"
  head: Head = { type: "branch", name: "main" };
  index: Record<string, string> = {}; // staged tree
  workdir: Record<string, string> = {}; // working directory
  reflog: ReflogEntry[] = [];
  stash: { index: Record<string, string>; workdir: Record<string, string>; message: string }[] = []; // stash@{0} == index 0
  seq = 0;
  userName = "you";
  userEmail = "you@example.com";

  // ---- snapshots (for the sandbox-level "undo") --------------------------
  snapshot(): string {
    return JSON.stringify({
      initialized: this.initialized,
      commits: this.commits,
      refs: this.refs,
      tags: this.tags,
      remoteRefs: this.remoteRefs,
      remoteUrl: this.remoteUrl,
      upstream: this.upstream,
      head: this.head,
      index: this.index,
      workdir: this.workdir,
      reflog: this.reflog,
      stash: this.stash,
      seq: this.seq,
      userName: this.userName,
      userEmail: this.userEmail,
    });
  }
  restore(snap: string) {
    Object.assign(this, JSON.parse(snap));
  }

  // ---- helpers -----------------------------------------------------------
  private all(): Set<string> {
    return new Set(Object.keys(this.commits));
  }
  headCommit(): Commit | null {
    if (this.head.type === "detached") return this.commits[this.head.oid] ?? null;
    const oid = this.refs[this.head.name];
    return oid ? this.commits[oid] : null;
  }
  headOid(): Oid | null {
    return this.head.type === "detached" ? this.head.oid : this.refs[this.head.name] ?? null;
  }
  headBranch(): string | null {
    return this.head.type === "branch" ? this.head.name : null;
  }
  private headTree(): Record<string, string> {
    const c = this.headCommit();
    return c ? { ...c.tree } : {};
  }
  private pushReflog(oid: Oid | null, action: string, message: string) {
    this.reflog.unshift({ oid, action, message, seq: this.seq++ });
  }

  // resolve "HEAD", "HEAD~2", "HEAD^", "<branch>", "<branch>~1", "<tag>",
  // "origin/main", or a (prefix of a) commit oid
  resolveRef(ref: string): Oid | null {
    if (!ref) return null;
    const m = ref.match(/^([^~^]+)((?:[~^]\d*)*)$/);
    if (!m) return null;
    const base = m[1];
    const path = m[2] || "";
    let oid: Oid | null = null;
    if (base === "HEAD" || base === "@") oid = this.headOid();
    else if (this.refs[base]) oid = this.refs[base];
    else if (this.tags[base]) oid = this.tags[base];
    else if (this.remoteRefs[base]) oid = this.remoteRefs[base];
    else if (base.startsWith("origin/") && this.remoteRefs[base]) oid = this.remoteRefs[base];
    else {
      // commit oid (allow unique prefixes)
      const hits = Object.keys(this.commits).filter((c) => c.startsWith(base));
      if (hits.length === 1) oid = hits[0];
      else if (this.commits[base]) oid = base;
    }
    if (!oid) return null;
    // walk ~ / ^ suffixes
    const steps = path.match(/[~^]\d*/g) ?? [];
    for (const s of steps) {
      const c: Commit | undefined = this.commits[oid!];
      if (!c) return null;
      const n = s.length > 1 ? parseInt(s.slice(1), 10) : s[0] === "~" ? 1 : 1;
      if (s[0] === "~") {
        for (let i = 0; i < n; i++) {
          const cc: Commit | undefined = this.commits[oid!];
          if (!cc || !cc.parents[0]) return null;
          oid = cc.parents[0];
        }
      } else {
        // ^N -> Nth parent (1-indexed), ^ alone -> first parent
        const idx = s.length > 1 ? n - 1 : 0;
        if (!c.parents[idx]) return null;
        oid = c.parents[idx];
      }
    }
    return oid;
  }

  isAncestor(anc: Oid, of: Oid): boolean {
    if (anc === of) return true;
    const seen = new Set<Oid>();
    const stack = [of];
    while (stack.length) {
      const x = stack.pop()!;
      if (x === anc) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      const c = this.commits[x];
      if (c) stack.push(...c.parents);
    }
    return false;
  }

  // log: reachable commits from a set of starting oids, newest (highest seq) first
  logFrom(starts: Oid[]): Commit[] {
    const seen = new Set<Oid>();
    const stack = [...starts];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x) || !this.commits[x]) continue;
      seen.add(x);
      stack.push(...this.commits[x].parents);
    }
    return [...seen].map((o) => this.commits[o]).sort((a, b) => b.seq - a.seq);
  }
  allCommits(): Commit[] {
    return Object.values(this.commits).sort((a, b) => b.seq - a.seq);
  }
  refsAt(oid: Oid): { name: string; kind: "head" | "branch" | "tag" | "remote" }[] {
    const out: { name: string; kind: "head" | "branch" | "tag" | "remote" }[] = [];
    for (const [n, o] of Object.entries(this.refs)) if (o === oid) out.push({ name: n, kind: this.headBranch() === n ? "head" : "branch" });
    for (const [n, o] of Object.entries(this.tags)) if (o === oid) out.push({ name: n, kind: "tag" });
    for (const [n, o] of Object.entries(this.remoteRefs)) if (o === oid) out.push({ name: n, kind: "remote" });
    return out;
  }

  // ---- working-tree status ----------------------------------------------
  status() {
    const head = this.headTree();
    const staged: { file: string; how: "new" | "modified" | "deleted" }[] = [];
    const notStaged: { file: string; how: "modified" | "deleted" }[] = [];
    const untracked: string[] = [];
    const files = new Set([...Object.keys(head), ...Object.keys(this.index), ...Object.keys(this.workdir)]);
    for (const f of [...files].sort()) {
      const inHead = f in head;
      const inIndex = f in this.index;
      const inWork = f in this.workdir;
      // staged = index vs HEAD
      if (inIndex && !inHead) staged.push({ file: f, how: "new" });
      else if (inIndex && inHead && this.index[f] !== head[f]) staged.push({ file: f, how: "modified" });
      else if (!inIndex && inHead) staged.push({ file: f, how: "deleted" });
      // unstaged = workdir vs index
      if (inWork && inIndex && this.workdir[f] !== this.index[f]) notStaged.push({ file: f, how: "modified" });
      else if (!inWork && inIndex) notStaged.push({ file: f, how: "deleted" });
      // untracked = workdir, not in index, not in HEAD
      if (inWork && !inIndex && !inHead) untracked.push(f);
    }
    return { staged, notStaged, untracked };
  }
  isDirty(): boolean {
    const s = this.status();
    return s.staged.length > 0 || s.notStaged.length > 0;
  }

  branchList(): { name: string; current: boolean; oid: Oid }[] {
    return Object.keys(this.refs)
      .sort()
      .map((n) => ({ name: n, current: this.headBranch() === n, oid: this.refs[n] }));
  }

  // ===========================================================================
  // command dispatch
  // ===========================================================================
  run(line: string, quiet = false): RunResult {
    const raw = line.trim();
    if (!raw) return { lines: [], changed: false };
    // command chaining:  a && b && c
    if (!quiet && /\s&&\s/.test(raw)) {
      const parts = raw.split(/\s*&&\s*/).filter((p) => p.trim().length);
      if (parts.length > 1) {
        const out: OutLine[] = [{ text: raw, kind: "cmd" }];
        let changed = false;
        let clear = false;
        let resetSandbox = false;
        let errored = false;
        for (const p of parts) {
          const r = this.run(p, true);
          out.push(...r.lines);
          changed ||= r.changed;
          clear ||= !!r.clear;
          resetSandbox ||= !!r.resetSandbox;
          if (r.errored) {
            errored = true;
            break;
          }
        }
        return { lines: out, changed, errored, clear: clear || undefined, resetSandbox: resetSandbox || undefined };
      }
    }
    const echo: OutLine = { text: raw, kind: "cmd" };
    const head: OutLine[] = quiet ? [] : [echo];
    const tok = tokenize(raw);
    const cmd = tok[0];
    const rest = tok.slice(1);
    const wrap = (lines: OutLine[], changed = false, extra: Partial<RunResult> = {}): RunResult => ({ lines: [...head, ...lines], changed, ...extra });
    const err = (msg: string) => wrap([{ text: msg, kind: "err" }], false, { errored: true });
    const out = (lines: (string | OutLine)[], changed = false) => wrap(lines.map((l) => (typeof l === "string" ? { text: l, kind: "out" as OutKind } : l)), changed);

    try {
      switch (cmd) {
        case "clear":
        case "cls":
          return { lines: [], changed: false, clear: true };
        case "help":
          return out(HELP_LINES);
        case "ls":
          return out(this.cmdLs());
        case "pwd":
          return out(["/home/" + this.userName + "/project"]);
        case "cat":
          return this.cmdCat(rest, out, err);
        case "touch":
          return this.cmdTouch(rest, out, err, wrap);
        case "echo":
          return this.cmdEcho(rest, raw, out, err, wrap);
        case "rm":
          return this.cmdRmShell(rest, out, err, wrap);
        case "mkdir":
          return out([]); // dirs aren't modeled; accept silently
        case "git":
          return this.git(rest, raw, { wrap, err, out });
        default:
          return err(`${cmd}: command not found — try \`help\``);
      }
    } catch (e) {
      return err("internal error: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  // ---- tiny shell --------------------------------------------------------
  private cmdLs(): OutLine[] {
    const fs = Object.keys(this.workdir).sort();
    if (this.initialized) fs.unshift(".git/");
    return fs.length ? [{ text: fs.join("   "), kind: "out" }] : [];
  }
  private cmdCat(rest: string[], out: (l: (string | OutLine)[]) => RunResult, err: (m: string) => RunResult): RunResult {
    if (!rest[0]) return err("usage: cat <file>");
    if (!(rest[0] in this.workdir)) return err(`cat: ${rest[0]}: No such file`);
    const c = this.workdir[rest[0]];
    return out(c.length ? c.split("\n") : ["(empty file)"]);
  }
  private cmdTouch(rest: string[], out: (l: (string | OutLine)[], c?: boolean) => RunResult, err: (m: string) => RunResult, _w: unknown): RunResult {
    if (!rest[0]) return err("usage: touch <file>");
    let changed = false;
    for (const f of rest) if (!(f in this.workdir)) ((this.workdir[f] = ""), (changed = true));
    return out([], changed);
  }
  private cmdEcho(rest: string[], raw: string, out: (l: (string | OutLine)[], c?: boolean) => RunResult, err: (m: string) => RunResult, _w: unknown): RunResult {
    // support: echo TEXT            -> print
    //          echo TEXT > file     -> write
    //          echo TEXT >> file    -> append a line
    const gt = raw.indexOf(">");
    if (gt === -1) return out([rest.join(" ")]);
    const append = raw[gt + 1] === ">";
    const text = tokenize(raw.slice(4, gt)).join(" ");
    const file = tokenize(raw.slice(gt + (append ? 2 : 1)))[0];
    if (!file) return err("syntax error near `>`");
    if (append && file in this.workdir) this.workdir[file] = this.workdir[file] + "\n" + text;
    else this.workdir[file] = text;
    return out([], true);
  }
  private cmdRmShell(rest: string[], out: (l: (string | OutLine)[], c?: boolean) => RunResult, err: (m: string) => RunResult, _w: unknown): RunResult {
    const targets = rest.filter((r) => !r.startsWith("-"));
    if (!targets[0]) return err("usage: rm <file>");
    let changed = false;
    for (const f of targets) {
      if (f in this.workdir) ((delete this.workdir[f]), (changed = true));
      else return err(`rm: ${f}: No such file`);
    }
    return out([], changed);
  }

  // ===========================================================================
  // git subcommands
  // ===========================================================================
  private git(
    args: string[],
    raw: string,
    h: { wrap: (l: OutLine[], c?: boolean, e?: Partial<RunResult>) => RunResult; err: (m: string) => RunResult; out: (l: (string | OutLine)[], c?: boolean) => RunResult },
  ): RunResult {
    const { wrap, err, out } = h;
    const sub = args[0];
    const a = args.slice(1);
    const flags = new Set(a.filter((x) => x.startsWith("-")));
    const pos = a.filter((x) => !x.startsWith("-"));

    if (!sub) return out(["usage: git <command> — try `help` for the commands this sandbox knows"]);

    if (sub !== "init" && !this.initialized && !["help", "--help", "version", "--version"].includes(sub)) {
      return err("fatal: not a git repository — run `git init` first");
    }

    switch (sub) {
      case "version":
      case "--version":
        return out(["git version 2.45.0 (worktree sandbox)"]);
      case "help":
      case "--help":
        return out(HELP_LINES);

      // ---- init ----------------------------------------------------------
      case "init": {
        if (this.initialized) return out(["Reinitialized existing Git repository in /project/.git/"]);
        this.initialized = true;
        this.head = { type: "branch", name: "main" };
        this.pushReflog(null, "init", "created repository");
        return out([{ text: "Initialized empty Git repository in /project/.git/", kind: "ok" }], true);
      }

      // ---- config --------------------------------------------------------
      case "config": {
        if (pos[0] === "user.name") {
          if (pos[1]) this.userName = pos[1];
          return out([this.userName], !!pos[1]);
        }
        if (pos[0] === "user.email") {
          if (pos[1]) this.userEmail = pos[1];
          return out([this.userEmail], !!pos[1]);
        }
        return out(["(config noted)"], false);
      }

      // ---- status --------------------------------------------------------
      case "status":
        return out(this.cmdStatus());

      // ---- add -----------------------------------------------------------
      case "add": {
        if (!pos.length) return err("Nothing specified, nothing added.\nhint: maybe you wanted `git add .`?");
        const targets = pos.includes(".") || pos.includes("-A") || flags.has("-A") ? "ALL" : pos;
        const head = this.headCommit()?.tree ?? {};
        const candidates = targets === "ALL" ? new Set([...Object.keys(this.workdir), ...Object.keys(this.index), ...Object.keys(head)]) : new Set(targets as string[]);
        let any = false;
        for (const f of candidates) {
          if (f in this.workdir) ((this.index[f] = this.workdir[f]), (any = true));
          else if (f in this.index || f in head) ((delete this.index[f]), (any = true)); // stage a deletion
          else if (targets !== "ALL") return err(`fatal: pathspec '${f}' did not match any files`);
        }
        return out([], any);
      }

      // ---- restore / reset (file form) -----------------------------------
      case "restore": {
        const stagedFlag = flags.has("--staged") || flags.has("-S");
        if (!pos.length) return err("usage: git restore [--staged] <file>");
        const head = this.headCommit()?.tree ?? {};
        let any = false;
        for (const f of pos) {
          if (stagedFlag) {
            if (f in head) ((this.index[f] = head[f]), (any = true));
            else if (f in this.index) ((delete this.index[f]), (any = true));
          } else {
            if (f in this.index) ((this.workdir[f] = this.index[f]), (any = true));
            else if (f in this.workdir && !(f in head)) ((delete this.workdir[f]), (any = true));
          }
        }
        return out([], any);
      }

      // ---- commit --------------------------------------------------------
      case "commit": {
        // accept: git commit -m "msg"  (and -am / -a -m)
        const mIdx = a.findIndex((x) => x === "-m" || x === "-am" || x === "--message");
        const stageAll = a.some((x) => x === "-a" || x === "-am" || x === "--all");
        if (stageAll) for (const f of Object.keys(this.workdir)) if (f in (this.headCommit()?.tree ?? {}) || f in this.index) this.index[f] = this.workdir[f];
        let msg = mIdx !== -1 ? a[mIdx + 1] : undefined;
        if (!msg) return err('this sandbox needs a message: git commit -m "your message"');
        // is there anything staged?
        const head = this.headCommit()?.tree ?? {};
        const headOid = this.headOid();
        const same = JSON.stringify(this.index) === JSON.stringify(head);
        if (same && headOid) return err("nothing to commit, working tree clean\nhint: stage changes with `git add <file>` first");
        const oid = shortHash(this.all());
        const parents = headOid ? [headOid] : [];
        const c: Commit = { oid, message: msg, parents, tree: { ...this.index }, author: this.userName, time: Date.now() + this.seq, seq: this.seq++ };
        this.commits[oid] = c;
        // advance current branch (creating it if this is the first commit)
        const br = this.headBranch();
        if (br) this.refs[br] = oid;
        else if (this.head.type === "detached") this.head = { type: "detached", oid };
        this.workdir = { ...this.index }; // working tree now matches the commit
        this.pushReflog(oid, parents.length ? "commit" : "commit (initial)", msg);
        const shortStat = this.diffStat(head, c.tree);
        return out(
          [
            { text: `[${br ?? "detached HEAD"} ${oid}] ${msg}`, kind: "ok" },
            { text: ` ${shortStat}`, kind: "out" },
          ],
          true,
        );
      }

      // ---- rm ------------------------------------------------------------
      case "rm": {
        if (!pos.length) return err("usage: git rm <file>");
        let any = false;
        for (const f of pos) {
          if (f in this.workdir) ((delete this.workdir[f]), (any = true));
          if (f in this.index) ((delete this.index[f]), (any = true));
          if (!any) return err(`fatal: pathspec '${f}' did not match any files`);
        }
        return out([{ text: pos.map((f) => `rm '${f}'`).join("\n"), kind: "out" }], any);
      }

      // ---- log -----------------------------------------------------------
      case "log": {
        const oneline = flags.has("--oneline");
        const all = flags.has("--all");
        const starts = all ? [...Object.values(this.refs), ...Object.values(this.tags), ...Object.values(this.remoteRefs), ...(this.headOid() ? [this.headOid()!] : [])] : this.headOid() ? [this.headOid()!] : [];
        if (!starts.length) return err("fatal: your current branch 'main' does not have any commits yet");
        const list = this.logFrom([...new Set(starts)]);
        const lines: OutLine[] = [];
        const headOid = this.headOid();
        for (const c of list) {
          const decor = this.decorate(c.oid, headOid);
          if (oneline) {
            lines.push({ text: `${c.oid}${decor} ${c.message}`, kind: "out" });
          } else {
            lines.push({ text: `commit ${c.oid}${decor}`, kind: "note" });
            lines.push({ text: `Author: ${c.author} <${this.userEmail}>`, kind: "out" });
            lines.push({ text: `Date:   ${new Date(c.time).toUTCString()}`, kind: "out" });
            lines.push({ text: "", kind: "out" });
            lines.push({ text: `    ${c.message}`, kind: "out" });
            lines.push({ text: "", kind: "out" });
          }
        }
        return wrap(lines);
      }

      // ---- branch --------------------------------------------------------
      case "branch": {
        if (flags.has("-d") || flags.has("-D")) {
          const name = pos[0];
          if (!name) return err("usage: git branch -d <name>");
          if (!this.refs[name]) return err(`error: branch '${name}' not found.`);
          if (this.headBranch() === name) return err(`error: cannot delete branch '${name}' — you are on it.`);
          delete this.refs[name];
          delete this.upstream[name];
          return out([`Deleted branch ${name}.`], true);
        }
        if (!pos.length) {
          const list = this.branchList().map((b) => (b.current ? `* ${b.name}` : `  ${b.name}`));
          return out(list.length ? list : ["(no branches yet — make a commit first)"]);
        }
        const name = pos[0];
        if (this.refs[name]) return err(`fatal: a branch named '${name}' already exists`);
        const at = pos[1] ? this.resolveRef(pos[1]) : this.headOid();
        if (!at) return err(pos[1] ? `fatal: not a valid object name: '${pos[1]}'` : "fatal: no commit yet — `git commit` something first");
        this.refs[name] = at;
        return out([], true);
      }

      // ---- tag -----------------------------------------------------------
      case "tag": {
        if (flags.has("-d")) {
          const n = pos[0];
          if (!n || !this.tags[n]) return err(`error: tag '${n}' not found.`);
          delete this.tags[n];
          return out([`Deleted tag '${n}'`], true);
        }
        if (!pos.length) return out(Object.keys(this.tags).sort());
        const n = pos[0];
        if (this.tags[n]) return err(`fatal: tag '${n}' already exists`);
        const at = pos[1] ? this.resolveRef(pos[1]) : this.headOid();
        if (!at) return err("fatal: no commit to tag yet");
        this.tags[n] = at;
        return out([], true);
      }

      // ---- checkout / switch --------------------------------------------
      case "checkout":
      case "switch": {
        const makeNew = flags.has("-b") || flags.has("-c") || flags.has("-C");
        if (makeNew) {
          const name = pos[0];
          if (!name) return err("usage: git checkout -b <name>");
          if (this.refs[name]) return err(`fatal: a branch named '${name}' already exists`);
          const at = pos[1] ? this.resolveRef(pos[1]) : this.headOid();
          this.refs[name] = at ?? this.refs[this.headBranch() ?? "main"] ?? "";
          if (!this.refs[name]) {
            // unborn -> just move HEAD to the new branch name, still unborn
            delete this.refs[name];
            this.head = { type: "branch", name };
            return out([`Switched to a new branch '${name}'`], true);
          }
          this.head = { type: "branch", name };
          this.pushReflog(this.headOid(), "checkout", `moving to ${name}`);
          return out([{ text: `Switched to a new branch '${name}'`, kind: "ok" }], true);
        }
        const target = pos[0];
        if (!target) return err("usage: git " + sub + " <branch>");
        if (this.isDirty() && !flags.has("-f") && !flags.has("--force")) {
          return err(`error: your local changes would be overwritten by ${sub}.\nhint: commit them with \`git commit -m "..."\` or discard with \`git restore .\` first`);
        }
        if (this.refs[target] !== undefined) {
          this.head = { type: "branch", name: target };
          const t = this.refs[target];
          this.index = { ...this.commits[t].tree };
          this.workdir = { ...this.commits[t].tree };
          this.pushReflog(t, "checkout", `moving to ${target}`);
          return out([{ text: `Switched to branch '${target}'`, kind: "ok" }], true);
        }
        // maybe a commit oid / tag -> detached HEAD
        const oid = this.resolveRef(target);
        if (oid) {
          this.head = { type: "detached", oid };
          this.index = { ...this.commits[oid].tree };
          this.workdir = { ...this.commits[oid].tree };
          this.pushReflog(oid, "checkout", `moving to ${target}`);
          return out(
            [
              { text: `Note: switching to '${target}'.`, kind: "note" },
              { text: "You are in 'detached HEAD' state — new commits won't belong to any branch.", kind: "note" },
              { text: `HEAD is now at ${oid} ${this.commits[oid].message}`, kind: "out" },
            ],
            true,
          );
        }
        return err(`error: pathspec '${target}' did not match any file(s) or branch known to git`);
      }

      // ---- merge ---------------------------------------------------------
      case "merge": {
        const other = pos[0];
        if (!other) return err("usage: git merge <branch>");
        const otherOid = this.resolveRef(other);
        if (!otherOid) return err(`merge: ${other} - not something we can merge`);
        const cur = this.headOid();
        if (!cur) return err("fatal: no commit on the current branch yet");
        if (this.isAncestor(otherOid, cur)) return out(["Already up to date."]);
        const br = this.headBranch();
        if (this.isAncestor(cur, otherOid)) {
          // fast-forward
          if (br) this.refs[br] = otherOid;
          else this.head = { type: "detached", oid: otherOid };
          this.index = { ...this.commits[otherOid].tree };
          this.workdir = { ...this.commits[otherOid].tree };
          this.pushReflog(otherOid, "merge", `${other}: Fast-forward`);
          return out([{ text: `Updating ${cur}..${otherOid}`, kind: "out" }, { text: "Fast-forward", kind: "ok" }], true);
        }
        // true merge — no conflict simulation: union the trees, the merged branch wins ties
        const tree = { ...this.commits[cur].tree, ...this.commits[otherOid].tree };
        const oid = shortHash(this.all());
        const msg = `Merge branch '${other}'` + (br ? ` into ${br}` : "");
        this.commits[oid] = { oid, message: msg, parents: [cur, otherOid], tree, author: this.userName, time: Date.now() + this.seq, seq: this.seq++ };
        if (br) this.refs[br] = oid;
        else this.head = { type: "detached", oid };
        this.index = { ...tree };
        this.workdir = { ...tree };
        this.pushReflog(oid, "merge", msg);
        return out([{ text: `Merge made by the 'ort' strategy.`, kind: "ok" }, { text: ` ${this.diffStat(this.commits[cur].tree, tree)}`, kind: "out" }], true);
      }

      // ---- reset ---------------------------------------------------------
      case "reset": {
        const hard = flags.has("--hard");
        const soft = flags.has("--soft");
        // git reset <file>  / git reset HEAD <file>  -> unstage
        const nonFlag = pos.slice();
        const looksLikeRef = nonFlag[0] && (this.resolveRef(nonFlag[0]) || nonFlag[0] === "HEAD" || /^HEAD[~^]/.test(nonFlag[0]));
        if (!hard && !soft && nonFlag.length && !looksLikeRef) {
          const head = this.headCommit()?.tree ?? {};
          for (const f of nonFlag) {
            if (f in head) this.index[f] = head[f];
            else delete this.index[f];
          }
          return out([], true);
        }
        if (!hard && !soft && nonFlag.length === 2 && nonFlag[0] === "HEAD") {
          const head = this.headCommit()?.tree ?? {};
          const f = nonFlag[1];
          if (f in head) this.index[f] = head[f];
          else delete this.index[f];
          return out([], true);
        }
        const targetRef = nonFlag[0] ?? "HEAD";
        const oid = this.resolveRef(targetRef);
        if (!oid) return err(`fatal: ambiguous argument '${targetRef}': unknown revision`);
        const br = this.headBranch();
        const prev = this.headOid();
        if (br) this.refs[br] = oid;
        else this.head = { type: "detached", oid };
        if (hard) {
          this.index = { ...this.commits[oid].tree };
          this.workdir = { ...this.commits[oid].tree };
        } else if (!soft) {
          this.index = { ...this.commits[oid].tree }; // mixed: reset index, keep workdir
        }
        this.pushReflog(oid, "reset", `moving to ${targetRef}` + (hard ? " (--hard)" : soft ? " (--soft)" : ""));
        const lines: OutLine[] = [{ text: `HEAD is now at ${oid} ${this.commits[oid].message}`, kind: hard ? "ok" : "out" }];
        if (prev && prev !== oid) lines.push({ text: `(${prev} is still reachable via \`git reflog\` — nothing is really lost yet)`, kind: "hint" });
        return out(lines, true);
      }

      // ---- revert --------------------------------------------------------
      case "revert": {
        const t = pos[0];
        const oid = t ? this.resolveRef(t) : null;
        if (!oid) return err("usage: git revert <commit>");
        const target = this.commits[oid];
        const parent = target.parents[0] ? this.commits[target.parents[0]] : null;
        const cur = this.headOid();
        if (!cur) return err("fatal: nothing to revert onto");
        // produce a tree that is current minus the change introduced by `target`
        const base = parent?.tree ?? {};
        const tree = { ...this.commits[cur].tree };
        for (const f of new Set([...Object.keys(base), ...Object.keys(target.tree)])) {
          if (f in base) tree[f] = base[f];
          else delete tree[f];
        }
        const newOid = shortHash(this.all());
        const msg = `Revert "${target.message}"`;
        this.commits[newOid] = { oid: newOid, message: msg, parents: [cur], tree, author: this.userName, time: Date.now() + this.seq, seq: this.seq++ };
        const br = this.headBranch();
        if (br) this.refs[br] = newOid;
        else this.head = { type: "detached", oid: newOid };
        this.index = { ...tree };
        this.workdir = { ...tree };
        this.pushReflog(newOid, "revert", msg);
        return out([{ text: `[${br ?? "detached"} ${newOid}] ${msg}`, kind: "ok" }], true);
      }

      // ---- cherry-pick ---------------------------------------------------
      case "cherry-pick": {
        const t = pos[0];
        const oid = t ? this.resolveRef(t) : null;
        if (!oid) return err("usage: git cherry-pick <commit>");
        const target = this.commits[oid];
        const parent = target.parents[0] ? this.commits[target.parents[0]] : null;
        const cur = this.headOid();
        if (!cur) return err("fatal: no commit to cherry-pick onto");
        if (this.isDirty()) return err("error: your local changes would be overwritten — commit or stash them first");
        // apply just the change `target` introduced (parent → target) on top of HEAD
        const base = parent?.tree ?? {};
        const tree = { ...this.commits[cur].tree };
        for (const f of new Set([...Object.keys(base), ...Object.keys(target.tree)])) {
          const inBase = f in base;
          const inTarget = f in target.tree;
          if (inBase && inTarget && base[f] === target.tree[f]) continue; // target didn't touch this file
          if (inTarget) tree[f] = target.tree[f];
          else delete tree[f];
        }
        if (JSON.stringify(tree) === JSON.stringify(this.commits[cur].tree)) return out([`The previous cherry-pick is now empty (its changes are already present).`]);
        const newOid = shortHash(this.all());
        this.commits[newOid] = { oid: newOid, message: target.message, parents: [cur], tree, author: this.userName, time: Date.now() + this.seq, seq: this.seq++ };
        const br = this.headBranch();
        if (br) this.refs[br] = newOid;
        else this.head = { type: "detached", oid: newOid };
        this.index = { ...tree };
        this.workdir = { ...tree };
        this.pushReflog(newOid, "cherry-pick", target.message);
        return out([{ text: `[${br ?? "detached"} ${newOid}] ${target.message}`, kind: "ok" }], true);
      }

      // ---- reflog --------------------------------------------------------
      case "reflog": {
        if (!this.reflog.length) return out(["(reflog is empty)"]);
        const lines: OutLine[] = this.reflog
          .filter((e) => e.oid)
          .map((e, i) => ({ text: `${e.oid} HEAD@{${i}}: ${e.action}: ${e.message}`, kind: "out" as OutKind }));
        if (!lines.length) return out(["(no HEAD movements recorded yet)"]);
        return wrap(lines);
      }

      // ---- diff (file-level only) ---------------------------------------
      case "diff": {
        const staged = flags.has("--staged") || flags.has("--cached");
        const head = this.headCommit()?.tree ?? {};
        const left = staged ? head : this.index;
        const right = staged ? this.index : this.workdir;
        const lines: OutLine[] = [];
        for (const f of new Set([...Object.keys(left), ...Object.keys(right)])) {
          const l = left[f];
          const r = right[f];
          if (l === r) continue;
          lines.push({ text: `diff --git a/${f} b/${f}`, kind: "note" });
          if (l === undefined) lines.push({ text: `new file: ${f}`, kind: "ok" });
          else if (r === undefined) lines.push({ text: `deleted file: ${f}`, kind: "err" });
          else {
            (l ?? "").split("\n").forEach((line) => lines.push({ text: `- ${line}`, kind: "err" }));
            (r ?? "").split("\n").forEach((line) => lines.push({ text: `+ ${line}`, kind: "ok" }));
          }
        }
        return lines.length ? wrap(lines) : out([staged ? "(nothing staged)" : "(no unstaged changes)"]);
      }

      // ---- remote --------------------------------------------------------
      case "remote": {
        if (pos[0] === "add") {
          const name = pos[1];
          const url = pos[2];
          if (name !== "origin") return err("this sandbox only knows a remote called `origin` — try `git remote add origin <url>`");
          if (!url) return err("usage: git remote add origin <url>");
          this.remoteUrl = url;
          return out([], true);
        }
        if (pos.length === 0 || flags.has("-v")) {
          if (!this.remoteUrl) return out(["(no remotes — add one with `git remote add origin <url>`)"]);
          return out([`origin\t${this.remoteUrl} (fetch)`, `origin\t${this.remoteUrl} (push)`]);
        }
        return out(["(remote noted)"]);
      }

      // ---- push ----------------------------------------------------------
      case "push": {
        if (!this.remoteUrl) return err("fatal: no configured push destination.\nhint: run `git remote add origin <url>` first (use any github-ish URL)");
        const br = this.headBranch();
        if (!br) return err("fatal: you are not on a branch (detached HEAD) — `git checkout -b <name>` first");
        const oid = this.refs[br];
        if (!oid) return err(`error: src refspec ${br} does not match any commits — make a commit first`);
        const setUp = flags.has("-u") || flags.has("--set-upstream");
        if (setUp) this.upstream[br] = `origin/${br}`;
        const had = this.remoteRefs[`origin/${br}`];
        this.remoteRefs[`origin/${br}`] = oid;
        const lines: OutLine[] = [
          { text: `Enumerating objects, done.`, kind: "out" },
          { text: `To ${this.remoteUrl}`, kind: "out" },
          { text: had ? `   ${had}..${oid}  ${br} -> ${br}` : ` * [new branch]      ${br} -> ${br}`, kind: "ok" },
        ];
        if (setUp) lines.push({ text: `branch '${br}' set up to track 'origin/${br}'.`, kind: "out" });
        return wrap(lines, true);
      }

      // ---- fetch / pull --------------------------------------------------
      case "fetch":
        if (!this.remoteUrl) return err("fatal: no remote configured — `git remote add origin <url>`");
        return out(["Fetching origin", "Already up to date. (in this sandbox the remote never changes on its own)"]);
      case "pull": {
        if (!this.remoteUrl) return err("fatal: no remote configured — `git remote add origin <url>`");
        const br = this.headBranch();
        const r = br ? this.remoteRefs[`origin/${br}`] : undefined;
        if (!r) return out(["Already up to date. (nothing on origin yet — `git push -u origin <branch>` first)"]);
        return out(["Already up to date."]);
      }

      // ---- clone (minimal) ----------------------------------------------
      case "clone":
        return err("this sandbox starts from `git init`, not `git clone` — there's nothing to clone yet. Try `git init`.");

      // ---- stash ---------------------------------------------------------
      case "stash": {
        const act = pos[0] && !pos[0].startsWith("-") ? pos[0] : "push";
        if (act === "list") {
          if (!this.stash.length) return out(["(no stash entries)"]);
          return out(this.stash.map((s, i) => `stash@{${i}}: ${s.message}`));
        }
        if (act === "clear") {
          this.stash = [];
          return out(["(all stash entries cleared)"], true);
        }
        if (act === "drop") {
          if (!this.stash.length) return err("No stash entries found.");
          const dropped = this.stash.shift()!;
          return out([`Dropped stash@{0} (${dropped.message})`], true);
        }
        if (act === "push" || act === "save") {
          const inclU = a.includes("-u") || a.includes("--include-untracked") || a.includes("-a") || a.includes("--all");
          const mIdx = a.findIndex((x) => x === "-m" || x === "--message");
          const msg = mIdx !== -1 && a[mIdx + 1] ? a[mIdx + 1] : `WIP on ${this.headBranch() ?? "detached"}: ${this.headCommit()?.message ?? "(no commits)"}`;
          const stat = this.status();
          const trackedDirty = stat.staged.length > 0 || stat.notStaged.length > 0;
          if (!trackedDirty && !(inclU && stat.untracked.length > 0)) {
            return err("No local changes to save" + (!inclU && stat.untracked.length ? "\nhint: those files are untracked — `git stash -u` shelves those too" : ""));
          }
          const headTree = this.headCommit()?.tree ?? {};
          this.stash.unshift({ index: { ...this.index }, workdir: { ...this.workdir }, message: msg });
          const newWorkdir: Record<string, string> = { ...headTree };
          if (!inclU) for (const f of stat.untracked) newWorkdir[f] = this.workdir[f]; // plain `git stash` leaves untracked files alone
          this.index = { ...headTree };
          this.workdir = newWorkdir;
          return out([{ text: `Saved working directory and index state: ${msg}`, kind: "ok" }, { text: "(tracked changes are shelved — bring them back with `git stash pop`)", kind: "hint" }], true);
        }
        if (act === "pop" || act === "apply") {
          if (!this.stash.length) return err("No stash entries found.");
          let idx = 0;
          const ref = pos[1];
          if (ref) {
            const m = ref.match(/stash@\{(\d+)\}/) || ref.match(/^(\d+)$/);
            if (m) idx = parseInt(m[1], 10);
          }
          const s = this.stash[idx];
          if (!s) return err(`fatal: no stash entry at ${ref}`);
          if (this.isDirty()) return err("error: your local changes would be overwritten — commit them first");
          this.index = { ...s.index };
          this.workdir = { ...s.workdir };
          if (act === "pop") this.stash.splice(idx, 1);
          return out([{ text: `Restored stash@{${idx}}: ${s.message}${act === "pop" ? "  (and dropped it)" : ""}`, kind: "ok" }], true);
        }
        return err(`git stash: unknown subcommand '${act}' — try: push · pop · apply · list · drop · clear`);
      }

      default:
        return err(`git: '${sub}' is not a command this sandbox knows. Try \`help\`.`);
    }
  }

  // ---- formatting helpers ------------------------------------------------
  private decorate(oid: Oid, headOid: Oid | null): string {
    const parts: string[] = [];
    if (oid === headOid) {
      if (this.head.type === "branch") parts.push(`HEAD -> ${this.head.name}`);
      else parts.push("HEAD");
    }
    for (const [n, o] of Object.entries(this.refs)) if (o === oid && n !== this.headBranch()) parts.push(n);
    for (const [n, o] of Object.entries(this.remoteRefs)) if (o === oid) parts.push(n);
    for (const [n, o] of Object.entries(this.tags)) if (o === oid) parts.push(`tag: ${n}`);
    return parts.length ? ` (${parts.join(", ")})` : "";
  }
  private diffStat(a: Record<string, string>, b: Record<string, string>): string {
    let files = 0;
    for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[f] !== b[f]) files++;
    return `${files} file${files === 1 ? "" : "s"} changed`;
  }

  private cmdStatus(): OutLine[] {
    const lines: OutLine[] = [];
    const br = this.headBranch();
    if (br) {
      lines.push({ text: `On branch ${br}`, kind: "out" });
      const up = this.upstream[br];
      if (up) {
        const local = this.refs[br];
        const remote = this.remoteRefs[up];
        if (remote === local) lines.push({ text: `Your branch is up to date with '${up}'.`, kind: "out" });
        else if (remote && local && this.isAncestor(remote, local)) {
          const ahead = this.logFrom([local]).filter((c) => !this.isAncestor(c.oid, remote)).length;
          lines.push({ text: `Your branch is ahead of '${up}' by ${ahead} commit${ahead === 1 ? "" : "s"}.`, kind: "out" });
          lines.push({ text: `  (use "git push" to publish your local commits)`, kind: "hint" });
        } else if (!remote) lines.push({ text: `Your branch is based on '${up}', but the upstream is gone.`, kind: "out" });
      }
    } else lines.push({ text: `HEAD detached at ${this.headOid()}`, kind: "note" });
    if (!this.headOid()) lines.push({ text: "No commits yet", kind: "out" });
    const s = this.status();
    if (s.staged.length) {
      lines.push({ text: "", kind: "out" });
      lines.push({ text: "Changes to be committed:", kind: "out" });
      lines.push({ text: `  (use "git restore --staged <file>" to unstage)`, kind: "hint" });
      for (const x of s.staged) lines.push({ text: `\t${x.how === "new" ? "new file:   " : x.how === "deleted" ? "deleted:    " : "modified:   "}${x.file}`, kind: "ok" });
    }
    if (s.notStaged.length) {
      lines.push({ text: "", kind: "out" });
      lines.push({ text: "Changes not staged for commit:", kind: "out" });
      lines.push({ text: `  (use "git add <file>" to stage)`, kind: "hint" });
      for (const x of s.notStaged) lines.push({ text: `\t${x.how === "deleted" ? "deleted:    " : "modified:   "}${x.file}`, kind: "err" });
    }
    if (s.untracked.length) {
      lines.push({ text: "", kind: "out" });
      lines.push({ text: "Untracked files:", kind: "out" });
      lines.push({ text: `  (use "git add <file>" to include in what will be committed)`, kind: "hint" });
      for (const f of s.untracked) lines.push({ text: `\t${f}`, kind: "err" });
    }
    if (!s.staged.length && !s.notStaged.length && !s.untracked.length) {
      lines.push({ text: this.headOid() ? "nothing to commit, working tree clean" : "nothing to commit (create a file, then `git add`)", kind: "out" });
    }
    return lines;
  }
}

// ---------------------------------------------------------------------------

export const HELP_LINES: OutLine[] = [
  { text: "This is a safe sandbox. Nothing here touches a real repo. Commands it understands:", kind: "out" },
  { text: "", kind: "out" },
  { text: "  git init                       start a repository", kind: "out" },
  { text: '  echo "text" > file             create/overwrite a file (>> to append a line)', kind: "out" },
  { text: "  touch file        cat file     make an empty file / show a file", kind: "out" },
  { text: "  git status                     what's changed", kind: "out" },
  { text: "  git add <file> | .             stage changes", kind: "out" },
  { text: '  git commit -m "msg"            record a commit', kind: "out" },
  { text: "  git log [--oneline] [--all]    history", kind: "out" },
  { text: "  git branch [name] | -d name    list / create / delete branches", kind: "out" },
  { text: "  git checkout <name|commit>     switch (use -b to create:  git checkout -b feature)", kind: "out" },
  { text: "  git switch <name>              same idea (use -c to create)", kind: "out" },
  { text: "  git merge <branch>             merge another branch into this one", kind: "out" },
  { text: "  git tag [name]                 mark a commit", kind: "out" },
  { text: "  git reset [--soft|--hard] <ref>   move the branch (try HEAD~1)", kind: "out" },
  { text: "  git restore [--staged] <file>     undo working-tree / staged changes", kind: "out" },
  { text: "  git revert <commit>            make a new commit that undoes an old one", kind: "out" },
  { text: "  git cherry-pick <commit>       copy one commit onto the current branch", kind: "out" },
  { text: "  git stash | stash pop | stash list   shelve / restore uncommitted work", kind: "out" },
  { text: "  git reflog                     every place HEAD has been — your safety net", kind: "out" },
  { text: "  git diff [--staged]            see what changed", kind: "out" },
  { text: "  git remote add origin <url>    point at a (pretend) GitHub remote", kind: "out" },
  { text: "  git push [-u origin <branch>]  publish to origin", kind: "out" },
  { text: "  ls   pwd   rm file   clear     basic shell bits", kind: "out" },
  { text: "", kind: "out" },
  { text: "Stuck? Open the hint on the current step, or type a command and see what git says.", kind: "hint" },
];
