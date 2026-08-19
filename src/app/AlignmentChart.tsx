import { FRIEND_COLORS } from "./components";
import { NEUTRAL_BAND } from "../shared/scoring";
import type { AlignmentAxes } from "../shared/types";

export interface ChartPoint {
  x: number;
  y: number;
  name?: string | null;
  /** roster/submission color; omit for a single neutral dot */
  colorIndex?: number;
}

/** Map -1..1 to viewBox units, 5-unit padding so edge dots stay inside. */
const X = (v: number) => 50 + 45 * v;
const Y = (v: number) => 50 - 45 * v;

/** Nudge overlapping dots apart deterministically so nobody disappears. */
function fanOut(points: ChartPoint[]): { px: number; py: number }[] {
  const buckets = new Map<string, number[]>();
  points.forEach((p, i) => {
    const key = `${Math.round(X(p.x) / 6)},${Math.round(Y(p.y) / 6)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(i);
  });
  const out = points.map((p) => ({ px: X(p.x), py: Y(p.y) }));
  for (const idxs of buckets.values()) {
    if (idxs.length < 2) continue;
    idxs.forEach((i, j) => {
      const angle = (j / idxs.length) * 2 * Math.PI;
      out[i] = { px: out[i].px + 4 * Math.cos(angle), py: out[i].py + 4 * Math.sin(angle) };
    });
  }
  return out;
}

/**
 * The 2D alignment grid, used everywhere: results (dots + consensus),
 * comparisons (+ "you" diamond), and — when `onPlace` is given — as the
 * interactive board the taker places people on. Axis-end labels are HTML
 * around the SVG so they wrap and theme like the AxisChart pole labels.
 */
export function AlignmentChart(props: {
  axes: AlignmentAxes;
  points: ChartPoint[];
  consensus?: { x: number; y: number };
  you?: { x: number; y: number };
  /** interactive: called with chart coords (-1..1, 2dp) when the plot is tapped/clicked */
  onPlace?: (x: number, y: number) => void;
  /** interactive: drag continuation of the same gesture; defaults to onPlace */
  onDrag?: (x: number, y: number) => void;
  /** interactive: tap a placed dot (index into points) to pick it back up */
  onPointClick?: (index: number) => void;
  /** index into points to ring-highlight (the re-armed dot) */
  armedIndex?: number;
}) {
  const { axes, points } = props;
  const positions = fanOut(points);
  const band = 45 * NEUTRAL_BAND; // the "Neutral" strip, in viewBox units

  function coords(e: React.PointerEvent<SVGSVGElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.max(-1, Math.min(1, Math.round(v * 100) / 100));
    return [
      clamp(((e.clientX - rect.left) / rect.width) * 2 - 1),
      clamp(-(((e.clientY - rect.top) / rect.height) * 2 - 1)),
    ];
  }

  function startPlace(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId); // tap places; keep dragging to fine-tune
    props.onPlace!(...coords(e));
  }

  function movePlace(e: React.PointerEvent<SVGSVGElement>) {
    if (e.buttons === 1) (props.onDrag ?? props.onPlace!)(...coords(e));
  }

  return (
    <div className="align-chart">
      <div className="align-label align-top">{axes.y.high}</div>
      <div className="align-label align-left">{axes.x.low}</div>
      <svg
        viewBox="0 0 100 100"
        className={`align-plot${props.onPlace ? " placeable" : ""}`}
        onPointerDown={props.onPlace ? startPlace : undefined}
        onPointerMove={props.onPlace ? movePlace : undefined}
        role={props.onPlace ? "button" : "img"}
        aria-label={`alignment chart: ${axes.x.low} to ${axes.x.high} across, ${axes.y.low} to ${axes.y.high} up`}
      >
        <rect x="0" y="0" width="100" height="100" className="align-bg" />
        {/* neutral band: inside it a coordinate reads as "Neutral" */}
        <rect x={50 - band} y="0" width={band * 2} height="100" className="align-band" />
        <rect x="0" y={50 - band} width="100" height={band * 2} className="align-band" />
        {[X(-0.5), X(0.5)].map((v) => (
          <g key={v} className="align-grid">
            <line x1={v} y1="0" x2={v} y2="100" />
            <line x1="0" y1={v} x2="100" y2={v} />
          </g>
        ))}
        <line x1="50" y1="0" x2="50" y2="100" className="align-axis" />
        <line x1="0" y1="50" x2="100" y2="50" className="align-axis" />

        {points.map((p, i) => {
          const { px, py } = positions[i];
          const label = p.name ?? "";
          return (
            <g
              key={i}
              className={`friend-c${(p.colorIndex ?? 0) % FRIEND_COLORS}`}
              onPointerDown={
                props.onPointClick
                  ? (e) => {
                      e.stopPropagation();
                      props.onPointClick!(i);
                    }
                  : undefined
              }
            >
              <circle
                cx={px}
                cy={py}
                r="3.2"
                className={`align-dot${props.armedIndex === i ? " armed" : ""}`}
              >
                <title>{label || "placement"}</title>
              </circle>
              {label && (
                <text
                  x={px + (px > 70 ? -4.5 : 4.5)}
                  y={py + 1.6}
                  textAnchor={px > 70 ? "end" : "start"}
                  className="align-dot-label"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}

        {props.consensus && (
          <g className="align-consensus">
            <line
              x1={X(props.consensus.x) - 4}
              y1={Y(props.consensus.y)}
              x2={X(props.consensus.x) + 4}
              y2={Y(props.consensus.y)}
            />
            <line
              x1={X(props.consensus.x)}
              y1={Y(props.consensus.y) - 4}
              x2={X(props.consensus.x)}
              y2={Y(props.consensus.y) + 4}
            />
            <title>consensus</title>
          </g>
        )}
        {props.you && (
          <rect
            className="align-you"
            x={X(props.you.x) - 2.6}
            y={Y(props.you.y) - 2.6}
            width="5.2"
            height="5.2"
            transform={`rotate(45 ${X(props.you.x)} ${Y(props.you.y)})`}
          >
            <title>you</title>
          </rect>
        )}
      </svg>
      <div className="align-label align-right">{axes.x.high}</div>
      <div className="align-label align-bottom">{axes.y.low}</div>
    </div>
  );
}
