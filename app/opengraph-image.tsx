import { ImageResponse } from "next/og";

export const alt = "worktree — learn Git & GitHub by doing in your browser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// the commit-graph signature, drawn as a small SVG for the card
function GraphMark() {
  const COL = 46;
  const ROW = 78;
  const x = (c: number) => 30 + c * COL;
  const y = (r: number) => 24 + r * ROW;
  const sage = "#7fb38f";
  const mustard = "#d7a849";
  const terra = "#df6b4c";
  return (
    <svg width="160" height="500" viewBox="0 0 160 500" fill="none">
      {/* main lane */}
      <path d={`M${x(0)} ${y(0)} L${x(0)} ${y(5)}`} stroke={mustard} strokeWidth="4" strokeLinecap="round" />
      {/* feature lane: branches off row 4, two commits, merges back at row 1 */}
      <path d={`M${x(0)} ${y(4)} C${x(0)} ${y(3.4)} ${x(1)} ${y(3.6)} ${x(1)} ${y(3)} L${x(1)} ${y(2)} C${x(1)} ${y(1.4)} ${x(0)} ${y(1.6)} ${x(0)} ${y(1)}`} stroke={sage} strokeWidth="4" strokeLinecap="round" />
      {/* commits on main */}
      {[5, 4, 1, 0].map((r) => (
        <circle key={`m${r}`} cx={x(0)} cy={y(r)} r="9" fill={r === 0 ? mustard : "#cf9b3f"} stroke="#1a1611" strokeWidth="3" />
      ))}
      {/* HEAD ring on the top main commit */}
      <circle cx={x(0)} cy={y(0)} r="15" fill="none" stroke={terra} strokeWidth="3" />
      {/* commits on feature */}
      {[3, 2].map((r) => (
        <circle key={`f${r}`} cx={x(1)} cy={y(r)} r="9" fill={sage} stroke="#1a1611" strokeWidth="3" />
      ))}
    </svg>
  );
}

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#1a1611",
          backgroundImage:
            "linear-gradient(120deg, rgba(199,134,70,0.16), rgba(199,134,70,0) 42%), linear-gradient(300deg, rgba(111,155,126,0.12), rgba(111,155,126,0) 45%), linear-gradient(rgba(57,50,40,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(57,50,40,0.55) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 100% 100%, 48px 48px, 48px 48px",
          fontFamily: "sans-serif",
          color: "#ece1c9",
          padding: "64px 72px",
          position: "relative",
        }}
      >
        {/* commit-graph mark on the left */}
        <div style={{ display: "flex", alignItems: "center", paddingRight: 56, marginRight: 56, borderRight: "1px solid #393228" }}>
          <GraphMark />
        </div>

        {/* text block */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <div style={{ fontSize: 24, letterSpacing: 6, textTransform: "uppercase", color: "#d7a849" }}>a hands-on git manual</div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 18 }}>
            <div style={{ fontSize: 132, fontWeight: 800, color: "#f1e8d6", lineHeight: 1 }}>worktree</div>
          </div>
          <div style={{ fontSize: 50, fontWeight: 700, color: "#ece1c9", marginTop: 26, lineHeight: 1.12, maxWidth: 720 }}>Learn Git &amp; GitHub by doing.</div>
          <div style={{ fontSize: 27, color: "#b4a888", marginTop: 22, lineHeight: 1.4, maxWidth: 700 }}>
            Type real git commands in a safe in-browser sandbox and watch the commit graph move. Branch, merge, undo, reflog, push — nothing to lose.
          </div>
          <div style={{ display: "flex", marginTop: 40 }}>
            <div style={{ fontSize: 26, color: "#df6b4c", fontWeight: 600 }}>git.clintphillips.dev</div>
          </div>
        </div>

        {/* a faux terminal prompt in the corner */}
        <div style={{ position: "absolute", right: 72, bottom: 56, display: "flex", fontSize: 22, color: "#7c7259" }}>
          <span style={{ color: "#7fb38f" }}>~/project (main) $&nbsp;</span>
          <span style={{ color: "#ece1c9" }}>git commit -m &quot;learned something&quot;</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
