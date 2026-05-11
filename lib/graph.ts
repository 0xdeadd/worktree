// Lays out a commit DAG into (col, row) coordinates, roughly the way a git
// graph viewer would: newest at the top, branches keep their own vertical lane.

import type { GitRepo, Oid } from "./git/engine";

export interface GraphNode {
  oid: Oid;
  col: number;
  row: number;
  message: string;
  isMerge: boolean;
  isHead: boolean;
  refs: { name: string; kind: "head" | "branch" | "tag" | "remote" }[];
}
export interface GraphEdge {
  from: Oid; // child (higher up / smaller row)
  to: Oid; // parent (lower / larger row)
  fromCol: number;
  toCol: number;
  fromRow: number;
  toRow: number;
  color: string;
}
export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cols: number;
  rows: number;
}

export const LANE_COLORS = [
  "#cf9b3f", // mustard
  "#6f9b7e", // sage
  "#5f7d99", // slate
  "#a76f53", // tan
  "#8a5a76", // plum
  "#7d9b6f", // olive
  "#c8553d", // terra (last so it rarely collides with HEAD styling)
];
export function laneColor(col: number): string {
  return LANE_COLORS[col % LANE_COLORS.length];
}

export function buildGraph(repo: GitRepo): GraphLayout {
  const commits = repo.allCommits(); // newest (highest seq) first
  if (commits.length === 0) return { nodes: [], edges: [], cols: 0, rows: 0 };

  const rowOf = new Map<Oid, number>();
  commits.forEach((c, i) => rowOf.set(c.oid, i)); // row 0 = newest

  const headOid = repo.headOid();
  const colOf = new Map<Oid, number>();

  // lanes[i] = the oid we're currently expecting to land in column i (or null = free)
  const lanes: (Oid | null)[] = [];
  const firstFree = () => {
    const idx = lanes.findIndex((x) => x === null);
    if (idx !== -1) return idx;
    lanes.push(null);
    return lanes.length - 1;
  };

  for (const c of commits) {
    // which columns reserved this commit?
    const reserved: number[] = [];
    lanes.forEach((x, i) => x === c.oid && reserved.push(i));
    let col: number;
    if (reserved.length) {
      col = reserved[0];
      // the leftmost wins; the others were merges into this commit -> free them
      for (let k = 1; k < reserved.length; k++) lanes[reserved[k]] = null;
    } else {
      col = firstFree();
    }
    colOf.set(c.oid, col);
    lanes[col] = null; // we've consumed the reservation

    // hand the lane down to the first parent; extra parents get fresh lanes
    c.parents.forEach((p, i) => {
      if (!repo.commits[p]) return;
      if (i === 0) {
        if (colOf.has(p)) {
          // parent already placed (to the side) — leave a passthrough? simplest: nothing
        } else if (lanes[col] === null || lanes[col] === undefined) {
          lanes[col] = p;
        } else {
          lanes[firstFree()] = p;
        }
      } else {
        if (!colOf.has(p)) lanes[firstFree()] = p;
      }
    });
  }

  let cols = 1;
  colOf.forEach((v) => (cols = Math.max(cols, v + 1)));
  lanes.forEach((_, i) => (cols = Math.max(cols, i + 1)));

  const nodes: GraphNode[] = commits.map((c) => ({
    oid: c.oid,
    col: colOf.get(c.oid) ?? 0,
    row: rowOf.get(c.oid)!,
    message: c.message,
    isMerge: c.parents.length > 1,
    isHead: c.oid === headOid,
    refs: repo.refsAt(c.oid),
  }));

  const edges: GraphEdge[] = [];
  for (const c of commits) {
    for (const p of c.parents) {
      if (!repo.commits[p]) continue;
      const fromCol = colOf.get(c.oid) ?? 0;
      const toCol = colOf.get(p) ?? 0;
      const fromRow = rowOf.get(c.oid)!;
      const toRow = rowOf.get(p)!;
      // an edge takes the colour of the lane it travels down (the outer of the two columns)
      const color = laneColor(fromCol === toCol ? fromCol : Math.max(fromCol, toCol));
      edges.push({ from: c.oid, to: p, fromCol, toCol, fromRow, toRow, color });
    }
  }

  return { nodes, edges, cols, rows: commits.length };
}
