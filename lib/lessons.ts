import type { GitRepo, OutLine } from "./git/engine";

export interface StepCtx {
  cmd: string; // raw line the user ran
  tokens: string[]; // tokenized
  output: OutLine[];
  errored: boolean;
}

export interface Step {
  prompt: string; // what to do, with `code` spans
  hint: string;
  // optional baseline captured the moment the step becomes active
  baseline?: (repo: GitRepo) => unknown;
  check: (repo: GitRepo, ctx: StepCtx, baseline: unknown) => boolean;
}

export interface Lesson {
  id: string;
  title: string;
  blurb: string; // one-liner under the title
  intro: string; // a paragraph or two, supports `code` and **bold** and \n\n
  done: string; // shown when the lesson is complete
  steps: Step[];
}

const isGit = (t: string[], ...rest: string[]) => t[0] === "git" && rest.every((r, i) => t[1 + i] === r);
const reachable = (repo: GitRepo) => {
  const o = repo.headOid();
  return o ? repo.logFrom([o]).length : 0;
};

export const LESSONS: Lesson[] = [
  // 1 -----------------------------------------------------------------------
  {
    id: "repo",
    title: "A repository from nothing",
    blurb: "init · a file · add · commit",
    intro:
      "Git turns an ordinary folder into a **repository** — a folder with memory. Every time you take a snapshot (a **commit**), git remembers exactly what every file looked like, and you can return to it forever.\n\nThere are three places a file can be: your **working directory** (where you edit), the **staging area** a.k.a. the *index* (a holding pen for the next snapshot), and the **commit history** (the permanent record). You move files: edit → `git add` → `git commit`.\n\nLet's make one.",
    done:
      "That's the whole loop, and you'll do it thousands of times: change files → `git add` → `git commit -m \"...\"`. Look at the graph on the right — that single dot is your first commit, with `HEAD` and `main` pointing at it. `HEAD` just means *where you are right now*.",
    steps: [
      {
        prompt: "Turn this folder into a git repository: `git init`",
        hint: "Type `git init` and press Enter. That's it — it creates a hidden `.git/` folder where all the history will live.",
        check: (r) => r.initialized,
      },
      {
        prompt: 'Create a file. Try: `echo "# My Project" > README.md`',
        hint: 'In a real shell, `echo "text" > file` writes that text into a file. Here it does the same. You could also `touch notes.txt` for an empty one.',
        check: (r) => Object.keys(r.workdir).length > 0,
      },
      {
        prompt: "Ask git what it sees right now: `git status`",
        hint: "`git status` is the command you'll run most. It shows what's changed, what's staged, and what git is ignoring. Right now README.md should be **untracked**.",
        check: (_r, ctx) => isGit(ctx.tokens, "status"),
      },
      {
        prompt: "Stage README.md for the next snapshot: `git add README.md`",
        hint: "`git add <file>` copies the file's current state into the staging area. `git add .` stages everything at once.",
        check: (r) => r.status().staged.length > 0,
      },
      {
        prompt: 'Take the snapshot: `git commit -m "first commit"`',
        hint: 'A commit needs a message. `git commit -m "first commit"`. The message is a note to your future self about what changed.',
        check: (r) => r.headOid() !== null,
      },
    ],
  },

  // 2 -----------------------------------------------------------------------
  {
    id: "history",
    title: "Building a history",
    blurb: "more commits · git log",
    intro:
      "One commit is lonely. The point of git is the *chain* of them — each commit points back to its parent, forming a history you can walk, search, and travel through.\n\nMake a couple more commits, then read the story back.",
    done:
      "`git log` is your history viewer. `--oneline` is the compact version you'll use constantly. Notice every commit has a short id (a hash) — that id is a permanent address you can always come back to.",
    steps: [
      {
        prompt: "Change something and commit it. e.g. `echo \"some notes\" > notes.txt`, then `git add .`, then `git commit -m \"add notes\"`",
        hint: "Three commands: create or edit a file, `git add .` to stage it, `git commit -m \"...\"`. Watch the graph grow a second dot.",
        check: (r) => r.allCommits().length >= 2,
      },
      {
        prompt: "And one more commit — change a file again, `git add`, `git commit -m \"...\"`",
        hint: "Same loop again. `echo \"more\" >> notes.txt` (the `>>` appends a line), `git add .`, `git commit -m \"more notes\"`.",
        check: (r) => r.allCommits().length >= 3,
      },
      {
        prompt: "Read the history: `git log --oneline`",
        hint: "`git log` shows full detail; `git log --oneline` shows one line per commit. Try both.",
        check: (_r, ctx) => isGit(ctx.tokens, "log"),
      },
    ],
  },

  // 3 -----------------------------------------------------------------------
  {
    id: "branch",
    title: "Branches",
    blurb: "a parallel line of work",
    intro:
      "A **branch** is just a movable label pointing at a commit. `main` is one such label. When you make a new branch, you get a second label — so you can build a feature without disturbing `main`, then bring it back later.\n\nCreating a branch is instant and free. People make them constantly: one per feature, one per bugfix, one per experiment.",
    done:
      "See the fork in the graph? `main` and `feature` now point at different commits. `HEAD -> feature` means that's where you are. Nothing on `feature` affects `main` until you merge — which is next.",
    steps: [
      {
        prompt: "Create a branch called `feature` and switch to it in one step: `git checkout -b feature`",
        hint: "`git checkout -b <name>` = make the branch + switch to it. (Newer git also spells this `git switch -c feature`.)",
        check: (r) => r.headBranch() === "feature",
      },
      {
        prompt: "Do some work on `feature`: create/edit a file, `git add`, then `git commit -m \"...\"`",
        hint: "You're on the feature branch now, so this commit lands there, not on main. e.g. `echo \"experiment\" > feature.txt`, `git add .`, `git commit -m \"start the feature\"`.",
        check: (r) => !!r.refs["feature"] && !!r.refs["main"] && r.refs["feature"] !== r.refs["main"],
      },
      {
        prompt: "Hop back to `main`: `git switch main` (or `git checkout main`)",
        hint: "Switching branches changes which files are in your working directory. `git switch main` puts you back; `feature.txt` will disappear from `ls` because it doesn't exist on `main` yet.",
        check: (r) => r.headBranch() === "main" && !!r.refs["feature"] && !!r.refs["main"] && r.refs["feature"] !== r.refs["main"],
      },
    ],
  },

  // 4 -----------------------------------------------------------------------
  {
    id: "merge",
    title: "Merging",
    blurb: "bringing a branch home",
    intro:
      "Merging takes the work from one branch and combines it into another. You stand on the branch you want to *receive* the changes (here, `main`) and run `git merge <other>`.\n\nTwo flavours: if `main` hasn't moved since you branched, git just slides the label forward — a **fast-forward**, no new commit. If both branches have new commits, git makes a **merge commit** with two parents, weaving the histories together.",
    done:
      "`feature`'s work is now part of `main`. The graph shows the lines rejoining. In real projects this is what a *pull request* does on GitHub: it's a merge, with a review step bolted on the front. The branch `feature` still exists — `git branch -d feature` cleans it up when you're done.",
    steps: [
      {
        prompt: "You're on `main`. Pull in the feature work: `git merge feature`",
        hint: "Make sure `git status` says you're on branch `main` first, then `git merge feature`. (When you're done, `git branch -d feature` tidies up the merged label — the commits stay.)",
        check: (r) => r.headBranch() === "main" && r.reflog.some((e) => e.action === "merge"),
      },
    ],
  },

  // 5 -----------------------------------------------------------------------
  {
    id: "undo",
    title: "Undo — your safety net",
    blurb: "reset · reflog · restore · revert",
    intro:
      "Everyone eventually `rm`s the wrong thing, force-pushes garbage, or lets a script wreck the repo. Here's the reassuring truth: **git almost never actually loses committed work.** Even when you delete commits, they sit around for ~90 days and the `reflog` remembers exactly where they were.\n\nWe'll deliberately blow away some commits — then bring them back.",
    done:
      "Nothing was ever truly gone. `git reflog` is a journal of every position `HEAD` has held; `git reset --hard <oid>` warps you back to any of them. For *uncommitted* changes, `git restore <file>` undoes edits and `git restore --staged <file>` un-stages. And `git revert <commit>` is the polite undo — it makes a *new* commit that cancels an old one, leaving history intact (use that one on shared branches).",
    steps: [
      {
        prompt: "Make sure your current branch has at least 3 commits. (Commit a couple more tiny changes if `git log --oneline` shows fewer.)",
        hint: "Need more? `echo \"x\" >> notes.txt`, `git add .`, `git commit -m \"tweak\"` — repeat until `git log --oneline` lists 3+.",
        check: (r) => reachable(r) >= 3,
      },
      {
        prompt: "Now the scary part — throw away your last 2 commits: `git reset --hard HEAD~2`",
        hint: "`HEAD~2` means \"two commits before where I am.\" `--hard` also resets your files. Watch the graph: those commits seem to vanish from your branch. (They're not really gone.)",
        check: (r) => r.reflog.some((e) => e.action === "reset" && /--hard/.test(e.message)),
      },
      {
        prompt: "Panic's over. Look at where `HEAD` has been: `git reflog`",
        hint: "`git reflog` lists `HEAD@{0}`, `HEAD@{1}`, ... — every recent position, newest first. The commit you want back is the one from *before* the reset (likely `HEAD@{1}`). Note its 7-character id.",
        check: (_r, ctx) => isGit(ctx.tokens, "reflog"),
      },
      {
        prompt: "Bring it all back: `git reset --hard <oid>` using the id from the reflog (the line *before* the reset).",
        hint: "Copy the short id from the reflog line that was your HEAD before the reset, then `git reset --hard a1b2c3d` (with your actual id). You can also use `git reset --hard HEAD@{1}`. The graph snaps back.",
        check: (r, ctx) => /reset/.test(ctx.cmd) && reachable(r) >= 3,
      },
    ],
  },

  // 6 -----------------------------------------------------------------------
  {
    id: "remote",
    title: "GitHub: the remote",
    blurb: "remote add · push · pull",
    intro:
      "Everything so far happened on your machine. **GitHub** (or GitLab, etc.) is just *another copy of your repo* living on a server. You introduce them once with `git remote add`, then you sync: `git push` sends your commits up, `git pull` brings others' commits down.\n\nThe server copy shows up in your history as `origin/main` — a read-only marker for \"what main looks like on the remote.\"",
    done:
      "`git push` uploads commits; `git pull` downloads and merges them. `-u` the first time sets the \"upstream\" so later you can just type `git push`. On GitHub, your repo's commits, branches, and that green contribution graph all come from exactly these pushes. A *pull request* is GitHub asking \"can I merge your branch into theirs?\" — same merge you did in chapter 4, plus review.",
    steps: [
      {
        prompt: "Point your repo at a remote. Use any GitHub-ish URL: `git remote add origin https://github.com/you/project.git`",
        hint: "`git remote add <name> <url>` — the name is almost always `origin`. The URL here is pretend; in real life GitHub gives you the exact one when you create the repo.",
        check: (r) => r.remoteUrl !== null,
      },
      {
        prompt: "Publish your main branch: `git push -u origin main`",
        hint: "`git push -u origin main` sends `main` to the remote and remembers the connection. Watch `origin/main` appear in the graph next to `main`.",
        check: (r) => !!r.remoteRefs["origin/main"],
      },
      {
        prompt: "Make one more commit, then sync it up with just: `git push`",
        hint: "Because you used `-u` last time, plain `git push` now works. Commit something first (`echo ... > f`, `git add .`, `git commit -m \"...\"`), then `git push`. `origin/main` catches up to `main`.",
        baseline: (r) => r.allCommits().length,
        check: (r, _c, b) => r.allCommits().length > (b as number) && r.remoteRefs["origin/main"] === r.refs["main"],
      },
    ],
  },

  // 7 -----------------------------------------------------------------------
  {
    id: "finish",
    title: "Tags & a tidy finish",
    blurb: "tag · the full picture",
    intro: "Last one. A **tag** is a permanent name for a particular commit — teams use it to mark releases (`v1.0`, `v2.3.1`). Unlike a branch, a tag doesn't move.\n\nThen take a look at the whole map of what you built.",
    done:
      "That's the core of git — and it's genuinely most of what daily git is. The **Sandbox** below this chapter list is yours: branch wildly, merge, `reset --hard`, push, break whatever you want — there's no wrong move and nothing to lose. When you switch to a real terminal, every command here works exactly the same. Go contribute something.",
    steps: [
      {
        prompt: "Mark the current commit as a release: `git tag v1.0`",
        hint: "`git tag <name>` tags wherever `HEAD` is. It'll show up on that commit in the graph.",
        check: (r) => Object.keys(r.tags).length > 0,
      },
      {
        prompt: "See everything at once: `git log --oneline --all`",
        hint: "`--all` shows commits from every branch and tag, not just the one you're on. Compare it to the graph on the right — same information, two views.",
        check: (_r, ctx) => isGit(ctx.tokens, "log"),
      },
    ],
  },
];

// a synthetic "chapter" appended in the UI for free play; not in LESSONS so it
// doesn't count toward progress.
export const SANDBOX_TITLE = "Sandbox — free play";
