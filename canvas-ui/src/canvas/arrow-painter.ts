import type { Waypoint } from '../layout/arrow-router';
import type { ArrowRoute } from '../state/graph-store';

const ARROW_COLORS = {
  di: { stroke: '#58a6ff', alpha: 0.6 },
  calls: { stroke: '#3fb950', alpha: 0.6 },
  'di-ghost': { stroke: '#484f58', alpha: 0.3 },
};

const ARROW_HEAD_SIZE = 8;
const CORNER_RADIUS = 6;
const LABEL_FONT = '10px "Segoe UI", system-ui, sans-serif';

export function paintArrow(
  ctx: CanvasRenderingContext2D,
  route: ArrowRoute,
  options: {
    isHovered: boolean;
  }
) {
  const { waypoints } = route;
  if (waypoints.length < 2) return;

  const colorConfig = ARROW_COLORS[route.type as keyof typeof ARROW_COLORS] ?? ARROW_COLORS.di;

  ctx.save();
  ctx.strokeStyle = colorConfig.stroke;
  ctx.globalAlpha = options.isHovered ? 1 : colorConfig.alpha;
  ctx.lineWidth = options.isHovered ? 2.5 : 1.5;

  // Dash pattern for calls and ghost edges
  if (route.type === 'calls') {
    ctx.setLineDash([6, 3]);
  } else if (route.type === 'di-ghost') {
    ctx.setLineDash([4, 4]);
  }

  // Draw polyline with rounded corners
  ctx.beginPath();
  drawRoundedPolyline(ctx, waypoints, CORNER_RADIUS);
  ctx.stroke();

  // Reset dash
  ctx.setLineDash([]);

  // Arrowhead at the last segment
  const last = waypoints[waypoints.length - 1];
  const prev = waypoints[waypoints.length - 2];
  drawArrowhead(ctx, prev, last, colorConfig.stroke);

  // Label at midpoint of the longest segment
  if (route.interfaceName) {
    const { x: labelX, y: labelY } = findLabelPosition(waypoints);
    ctx.font = LABEL_FONT;
    ctx.fillStyle = '#8b949e';
    ctx.globalAlpha = options.isHovered ? 1 : 0.8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(route.interfaceName, labelX, labelY - 4);
  }

  ctx.restore();
}

function drawRoundedPolyline(ctx: CanvasRenderingContext2D, points: Waypoint[], radius: number) {
  if (points.length < 2) return;

  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Compute vectors
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    // Clamp radius to half the shorter segment
    const r = Math.min(radius, len1 / 2, len2 / 2);

    // Points where the arc starts and ends
    const startX = curr.x - (dx1 / len1) * r;
    const startY = curr.y - (dy1 / len1) * r;
    const endX = curr.x + (dx2 / len2) * r;
    const endY = curr.y + (dy2 / len2) * r;

    ctx.lineTo(startX, startY);
    ctx.quadraticCurveTo(curr.x, curr.y, endX, endY);
  }

  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
}

function drawArrowhead(ctx: CanvasRenderingContext2D, from: Waypoint, to: Waypoint, color: string) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = ARROW_HEAD_SIZE;

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = ctx.globalAlpha; // preserve current alpha
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - size * Math.cos(angle - Math.PI / 6),
    to.y - size * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    to.x - size * Math.cos(angle + Math.PI / 6),
    to.y - size * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function findLabelPosition(waypoints: Waypoint[]): { x: number; y: number } {
  // Find the midpoint of the longest segment
  let longestLen = 0;
  let midX = 0, midY = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const dx = waypoints[i + 1].x - waypoints[i].x;
    const dy = waypoints[i + 1].y - waypoints[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > longestLen) {
      longestLen = len;
      midX = (waypoints[i].x + waypoints[i + 1].x) / 2;
      midY = (waypoints[i].y + waypoints[i + 1].y) / 2;
    }
  }

  return { x: midX, y: midY };
}
