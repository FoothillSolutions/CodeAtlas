import type { MrEdge } from '../types';
import type { NodePosition } from './dagre-layout';

export interface Waypoint {
  x: number;
  y: number;
}

export interface RoutedEdge {
  edge: MrEdge;
  waypoints: Waypoint[];
}

/**
 * Route edges as orthogonal (Manhattan-style) paths between nodes.
 *
 * - Edges leave from the RIGHT side of the source and arrive at the LEFT of the target.
 * - Vertical routing channels sit in the gap between source and target.
 * - Parallel edges are offset to avoid overlap.
 * - Routes avoid passing through other nodes.
 */
export function routeArrows(
  edges: MrEdge[],
  positions: Map<string, NodePosition>,
): RoutedEdge[] {
  const results: RoutedEdge[] = [];

  // Build a list of all node bounding boxes for obstruction checking
  const allNodes = Array.from(positions.values());

  // ── Group edges by source / target to assign ports ──────────────────

  const exitPortsByNode = new Map<string, MrEdge[]>();
  const entryPortsByNode = new Map<string, MrEdge[]>();

  for (const edge of edges) {
    if (!positions.has(edge.fromFileId) || !positions.has(edge.toFileId)) continue;

    if (!exitPortsByNode.has(edge.fromFileId)) exitPortsByNode.set(edge.fromFileId, []);
    exitPortsByNode.get(edge.fromFileId)!.push(edge);

    if (!entryPortsByNode.has(edge.toFileId)) entryPortsByNode.set(edge.toFileId, []);
    entryPortsByNode.get(edge.toFileId)!.push(edge);
  }

  // ── Compute exit-port Y positions ───────────────────────────────────

  const exitPortY = new Map<string, number>();

  for (const [nodeId, nodeEdges] of exitPortsByNode) {
    const pos = positions.get(nodeId)!;
    const spreadHeight = pos.height * 0.6;
    const startY = pos.y + pos.height / 2 - spreadHeight / 2;

    nodeEdges.forEach((edge, i) => {
      const y =
        nodeEdges.length === 1
          ? pos.y + pos.height / 2
          : startY + (i / (nodeEdges.length - 1)) * spreadHeight;
      exitPortY.set(edgeKey(edge), y);
    });
  }

  // ── Compute entry-port Y positions ──────────────────────────────────

  const entryPortY = new Map<string, number>();

  for (const [nodeId, nodeEdges] of entryPortsByNode) {
    const pos = positions.get(nodeId)!;
    const spreadHeight = pos.height * 0.6;
    const startY = pos.y + pos.height / 2 - spreadHeight / 2;

    nodeEdges.forEach((edge, i) => {
      const y =
        nodeEdges.length === 1
          ? pos.y + pos.height / 2
          : startY + (i / (nodeEdges.length - 1)) * spreadHeight;
      entryPortY.set(edgeKey(edge), y);
    });
  }

  // ── Route each edge ─────────────────────────────────────────────────

  const channelUsage = new Map<number, number>();
  const channelOffset = 10;
  const padding = 20;

  for (const edge of edges) {
    const sourcePos = positions.get(edge.fromFileId);
    const targetPos = positions.get(edge.toFileId);
    if (!sourcePos || !targetPos) continue;

    const key = edgeKey(edge);
    const y1 = exitPortY.get(key) ?? sourcePos.y + sourcePos.height / 2;
    const y2 = entryPortY.get(key) ?? targetPos.y + targetPos.height / 2;

    const sourceRight = sourcePos.x + sourcePos.width;
    const targetLeft = targetPos.x;

    let waypoints: Waypoint[];

    if (sourceRight + 40 < targetLeft) {
      // Normal case: source is to the left of target
      // Find a clear vertical channel between them that doesn't cross nodes
      const baseChannelX = Math.round((sourceRight + targetLeft) / 2);

      const usage = channelUsage.get(baseChannelX) ?? 0;
      channelUsage.set(baseChannelX, usage + 1);
      const halfIndex = Math.ceil(usage / 2);
      const sign = usage % 2 === 0 ? 1 : -1;
      let channelX = baseChannelX + halfIndex * channelOffset * sign;

      // Nudge channel X if it intersects a node
      channelX = findClearChannelX(channelX, Math.min(y1, y2), Math.max(y1, y2), allNodes, sourcePos, targetPos);

      waypoints = [
        { x: sourceRight + padding, y: y1 },
        { x: channelX, y: y1 },
        { x: channelX, y: y2 },
        { x: targetLeft - padding, y: y2 },
      ];
    } else {
      // Backwards or overlapping: route around
      // Go right past all overlapping nodes, then up/down, then left to target
      const maxRight = Math.max(sourceRight, targetPos.x + targetPos.width);
      const detourX = maxRight + 80;
      const aboveAll = Math.min(sourcePos.y, targetPos.y) - 60;
      const belowAll = Math.max(sourcePos.y + sourcePos.height, targetPos.y + targetPos.height) + 60;

      // Route above if target is below source, below otherwise
      const detourY = y1 < y2 ? aboveAll : belowAll;

      waypoints = [
        { x: sourceRight + padding, y: y1 },
        { x: detourX, y: y1 },
        { x: detourX, y: detourY },
        { x: targetLeft - padding - 40, y: detourY },
        { x: targetLeft - padding, y: y2 },
      ];
    }

    waypoints = simplifyWaypoints(waypoints);
    results.push({ edge, waypoints });
  }

  return results;
}

/**
 * Find a vertical channel X that doesn't pass through any node
 * (excluding the source and target nodes themselves).
 */
function findClearChannelX(
  preferredX: number,
  yMin: number,
  yMax: number,
  allNodes: NodePosition[],
  sourcePos: NodePosition,
  targetPos: NodePosition,
): number {
  const margin = 12;

  // Check if preferred X passes through any node in the Y range
  const obstructed = allNodes.some(node => {
    // Skip source and target
    if (node === sourcePos || node === targetPos) return false;
    // Check if the vertical line at preferredX intersects this node's bounding box
    return (
      preferredX >= node.x - margin &&
      preferredX <= node.x + node.width + margin &&
      yMax >= node.y - margin &&
      yMin <= node.y + node.height + margin
    );
  });

  if (!obstructed) return preferredX;

  // Try nudging left and right to find clear space
  for (let offset = 20; offset < 300; offset += 20) {
    const rightX = preferredX + offset;
    const leftX = preferredX - offset;

    const rightClear = !allNodes.some(node => {
      if (node === sourcePos || node === targetPos) return false;
      return (
        rightX >= node.x - margin &&
        rightX <= node.x + node.width + margin &&
        yMax >= node.y - margin &&
        yMin <= node.y + node.height + margin
      );
    });
    if (rightClear) return rightX;

    const leftClear = !allNodes.some(node => {
      if (node === sourcePos || node === targetPos) return false;
      return (
        leftX >= node.x - margin &&
        leftX <= node.x + node.width + margin &&
        yMax >= node.y - margin &&
        yMin <= node.y + node.height + margin
      );
    });
    if (leftClear) return leftX;
  }

  // Fallback: route far right of all nodes
  const maxRight = Math.max(...allNodes.map(n => n.x + n.width));
  return maxRight + 40;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function edgeKey(edge: MrEdge): string {
  return `${edge.fromFileId}-${edge.toFileId}`;
}

function simplifyWaypoints(points: Waypoint[]): Waypoint[] {
  if (points.length <= 2) return points;

  const result: Waypoint[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const isCollinearH = prev.y === curr.y && curr.y === next.y;
    const isCollinearV = prev.x === curr.x && curr.x === next.x;

    if (!isCollinearH && !isCollinearV) {
      result.push(curr);
    }
  }

  result.push(points[points.length - 1]);
  return result;
}
