import type { Waypoint } from '../layout/arrow-router';
import type { ArrowRoute } from '../state/graph-store';
import { colors, dimensions, fontStrings } from '../theme/tokens';

const ARROW_COLORS = {
  di: colors.edge.di,
  calls: colors.edge.calls,
  'di-ghost': colors.edge.ghost,
};

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

  if (route.type === 'calls') {
    ctx.setLineDash([6, 3]);
  } else if (route.type === 'di-ghost') {
    ctx.setLineDash([4, 4]);
  }

  ctx.beginPath();
  drawBezierPath(ctx, waypoints);
  ctx.stroke();

  ctx.setLineDash([]);

  const last = waypoints[waypoints.length - 1];
  const prev = waypoints[waypoints.length - 2];
  drawArrowhead(ctx, prev, last, colorConfig.stroke);

  if (route.interfaceName) {
    const { x: labelX, y: labelY } = findLabelPosition(waypoints);
    ctx.font = fontStrings.ui10;
    ctx.fillStyle = colors.edge.label;
    ctx.globalAlpha = options.isHovered ? 1 : 0.8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(route.interfaceName, labelX, labelY - 4);
  }

  ctx.restore();
}

/**
 * Convert Manhattan waypoints into a smooth cubic Bezier path.
 * Each corner gets a cubic curve whose control points pull along the
 * incoming and outgoing segments, producing smooth S-shaped transitions.
 */
function drawBezierPath(ctx: CanvasRenderingContext2D, points: Waypoint[]) {
  if (points.length < 2) return;

  if (points.length === 2) {
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }

  const radius = dimensions.cornerRadius;
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    if (len1 === 0 || len2 === 0) {
      ctx.lineTo(curr.x, curr.y);
      continue;
    }

    // Pull distance: use a larger fraction of the segment for smoother curves
    const pull = Math.min(radius * 2.5, len1 * 0.4, len2 * 0.4);

    const startX = curr.x - (dx1 / len1) * pull;
    const startY = curr.y - (dy1 / len1) * pull;
    const endX = curr.x + (dx2 / len2) * pull;
    const endY = curr.y + (dy2 / len2) * pull;

    ctx.lineTo(startX, startY);
    ctx.bezierCurveTo(curr.x, curr.y, curr.x, curr.y, endX, endY);
  }

  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
}

const FLATTEN_SEGMENTS = 10;

/**
 * Flatten a Bezier-curved route to a polyline for hit testing.
 * Must match the same curve logic as drawBezierPath.
 */
export function flattenRouteToPoly(waypoints: Waypoint[]): Waypoint[] {
  if (waypoints.length <= 2) return waypoints;

  const result: Waypoint[] = [waypoints[0]];
  const radius = dimensions.cornerRadius;

  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    if (len1 === 0 || len2 === 0) {
      result.push(curr);
      continue;
    }

    const pull = Math.min(radius * 2.5, len1 * 0.4, len2 * 0.4);

    const startX = curr.x - (dx1 / len1) * pull;
    const startY = curr.y - (dy1 / len1) * pull;
    const endX = curr.x + (dx2 / len2) * pull;
    const endY = curr.y + (dy2 / len2) * pull;

    result.push({ x: startX, y: startY });

    // Cubic bezier: B(t) = (1-t)³·P0 + 3(1-t)²t·P1 + 3(1-t)t²·P2 + t³·P3
    // With P1=P2=curr, this simplifies to: (1-t)³·start + 3(1-t)t·curr + t³·end
    for (let s = 1; s <= FLATTEN_SEGMENTS; s++) {
      const t = s / FLATTEN_SEGMENTS;
      const mt = 1 - t;
      const mt2t = 3 * mt * mt * t + 3 * mt * t * t; // 3(1-t)²t + 3(1-t)t² = 3(1-t)t
      result.push({
        x: mt * mt * mt * startX + mt2t * curr.x + t * t * t * endX,
        y: mt * mt * mt * startY + mt2t * curr.y + t * t * t * endY,
      });
    }
  }

  result.push(waypoints[waypoints.length - 1]);
  return result;
}

function drawArrowhead(ctx: CanvasRenderingContext2D, from: Waypoint, to: Waypoint, color: string) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = dimensions.arrowHeadSize;

  ctx.save();
  ctx.fillStyle = color;
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
