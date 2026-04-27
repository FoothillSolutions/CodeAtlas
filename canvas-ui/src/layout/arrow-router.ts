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

type Side = 'left' | 'right' | 'top' | 'bottom';

interface PortInfo {
  x: number;
  y: number;
  side: Side;
}

/**
 * Determine the nearest sides between two node rects.
 * Returns exit side for source and entry side for target.
 */
function nearestSides(src: NodePosition, tgt: NodePosition): { exitSide: Side; entrySide: Side } {
  const srcCx = src.x + src.width / 2;
  const srcCy = src.y + src.height / 2;
  const tgtCx = tgt.x + tgt.width / 2;
  const tgtCy = tgt.y + tgt.height / 2;

  const dx = tgtCx - srcCx;
  const dy = tgtCy - srcCy;

  // If there's meaningful horizontal separation, always route horizontally.
  // Only use vertical routing when nodes are stacked nearly directly above/below
  // with very little horizontal offset (dx < 20% of combined widths).
  const combinedWidth = (src.width + tgt.width) / 2;
  const horizontalThreshold = combinedWidth * 0.2;

  if (Math.abs(dx) > horizontalThreshold) {
    return dx >= 0
      ? { exitSide: 'right', entrySide: 'left' }
      : { exitSide: 'left', entrySide: 'right' };
  } else {
    return dy >= 0
      ? { exitSide: 'bottom', entrySide: 'top' }
      : { exitSide: 'top', entrySide: 'bottom' };
  }
}

/**
 * Compute a port position on a given side of a node.
 * portIndex / portCount are used to spread multiple ports along the side.
 */
function computePort(
  pos: NodePosition,
  side: Side,
  portIndex: number,
  portCount: number,
): PortInfo {
  const spread = 0.6;
  const t = portCount === 1 ? 0.5 : (1 - spread) / 2 + spread * (portIndex / (portCount - 1));

  switch (side) {
    case 'right':
      return { x: pos.x + pos.width, y: pos.y + t * pos.height, side };
    case 'left':
      return { x: pos.x, y: pos.y + t * pos.height, side };
    case 'bottom':
      return { x: pos.x + t * pos.width, y: pos.y + pos.height, side };
    case 'top':
      return { x: pos.x + t * pos.width, y: pos.y, side };
  }
}

/**
 * Route edges as orthogonal (Manhattan-style) paths between nodes.
 *
 * - Edges leave and enter from the nearest sides of source and target.
 * - Vertical/horizontal routing channels sit in the gap between them.
 * - Parallel edges are offset to avoid overlap.
 * - Routes avoid passing through other nodes.
 */
export function routeArrows(
  edges: MrEdge[],
  positions: Map<string, NodePosition>,
): RoutedEdge[] {
  const results: RoutedEdge[] = [];
  const allNodes = Array.from(positions.values());

  const exitGroups = new Map<string, MrEdge[]>();
  const entryGroups = new Map<string, MrEdge[]>();
  const edgeSides = new Map<string, { exitSide: Side; entrySide: Side }>();

  for (const edge of edges) {
    const srcPos = positions.get(edge.fromFileId);
    const tgtPos = positions.get(edge.toFileId);
    if (!srcPos || !tgtPos) continue;

    const sides = nearestSides(srcPos, tgtPos);
    edgeSides.set(edgeKey(edge), sides);

    const exitKey = `${edge.fromFileId}:${sides.exitSide}`;
    if (!exitGroups.has(exitKey)) exitGroups.set(exitKey, []);
    exitGroups.get(exitKey)!.push(edge);

    const entryKey = `${edge.toFileId}:${sides.entrySide}`;
    if (!entryGroups.has(entryKey)) entryGroups.set(entryKey, []);
    entryGroups.get(entryKey)!.push(edge);
  }

  const exitPorts = new Map<string, PortInfo>();
  const entryPorts = new Map<string, PortInfo>();

  for (const [groupKey, groupEdges] of exitGroups) {
    const [nodeId, side] = groupKey.split(':') as [string, Side];
    const pos = positions.get(nodeId)!;
    for (let i = 0; i < groupEdges.length; i++) {
      exitPorts.set(edgeKey(groupEdges[i]), computePort(pos, side, i, groupEdges.length));
    }
  }

  for (const [groupKey, groupEdges] of entryGroups) {
    const [nodeId, side] = groupKey.split(':') as [string, Side];
    const pos = positions.get(nodeId)!;
    for (let i = 0; i < groupEdges.length; i++) {
      entryPorts.set(edgeKey(groupEdges[i]), computePort(pos, side, i, groupEdges.length));
    }
  }

  const channelUsage = new Map<number, number>();
  const channelOffset = 10;
  const padding = 20;

  for (const edge of edges) {
    const sourcePos = positions.get(edge.fromFileId);
    const targetPos = positions.get(edge.toFileId);
    if (!sourcePos || !targetPos) continue;

    const key = edgeKey(edge);
    const sides = edgeSides.get(key)!;
    const exitPort = exitPorts.get(key)!;
    const entryPort = entryPorts.get(key)!;

    const waypoints = routeEdge(
      exitPort, entryPort, sides,
      sourcePos, targetPos, allNodes,
      channelUsage, channelOffset, padding,
    );

    results.push({ edge, waypoints: simplifyWaypoints(waypoints) });
  }

  return results;
}

function routeEdge(
  exitPort: PortInfo,
  entryPort: PortInfo,
  sides: { exitSide: Side; entrySide: Side },
  sourcePos: NodePosition,
  targetPos: NodePosition,
  allNodes: NodePosition[],
  channelUsage: Map<number, number>,
  channelOffset: number,
  padding: number,
): Waypoint[] {
  const { exitSide, entrySide } = sides;

  if ((exitSide === 'right' && entrySide === 'left') ||
      (exitSide === 'left' && entrySide === 'right')) {
    return routeHorizontal(exitPort, entryPort, exitSide, sourcePos, targetPos, allNodes, channelUsage, channelOffset, padding);
  }

  if ((exitSide === 'bottom' && entrySide === 'top') ||
      (exitSide === 'top' && entrySide === 'bottom')) {
    return routeVertical(exitPort, entryPort, exitSide, sourcePos, targetPos, allNodes, channelUsage, channelOffset, padding);
  }

  return [
    { x: exitPort.x, y: exitPort.y },
    { x: entryPort.x, y: entryPort.y },
  ];
}

function routeHorizontal(
  exitPort: PortInfo,
  entryPort: PortInfo,
  exitSide: Side,
  sourcePos: NodePosition,
  targetPos: NodePosition,
  allNodes: NodePosition[],
  channelUsage: Map<number, number>,
  channelOffset: number,
  padding: number,
): Waypoint[] {
  const goRight = exitSide === 'right';
  const stubX1 = exitPort.x + (goRight ? padding : -padding);
  const stubX2 = entryPort.x + (goRight ? -padding : padding);

  const gapOk = goRight
    ? (stubX1 + 20 < stubX2)
    : (stubX2 + 20 < stubX1);

  if (gapOk) {
    const baseChannelX = Math.round((stubX1 + stubX2) / 2);
    const usage = channelUsage.get(baseChannelX) ?? 0;
    channelUsage.set(baseChannelX, usage + 1);
    const halfIndex = Math.ceil(usage / 2);
    const sign = usage % 2 === 0 ? 1 : -1;
    let channelX = baseChannelX + halfIndex * channelOffset * sign;

    channelX = findClearChannelX(
      channelX,
      Math.min(exitPort.y, entryPort.y),
      Math.max(exitPort.y, entryPort.y),
      allNodes, sourcePos, targetPos,
    );

    return [
      { x: exitPort.x, y: exitPort.y },
      { x: stubX1, y: exitPort.y },
      { x: channelX, y: exitPort.y },
      { x: channelX, y: entryPort.y },
      { x: stubX2, y: entryPort.y },
      { x: entryPort.x, y: entryPort.y },
    ];
  }

  const maxRight = Math.max(sourcePos.x + sourcePos.width, targetPos.x + targetPos.width);
  const minLeft = Math.min(sourcePos.x, targetPos.x);
  const detourX = goRight ? maxRight + 80 : minLeft - 80;
  const aboveAll = Math.min(sourcePos.y, targetPos.y) - 60;
  const belowAll = Math.max(sourcePos.y + sourcePos.height, targetPos.y + targetPos.height) + 60;
  const detourY = exitPort.y < entryPort.y ? aboveAll : belowAll;

  return [
    { x: exitPort.x, y: exitPort.y },
    { x: stubX1, y: exitPort.y },
    { x: detourX, y: exitPort.y },
    { x: detourX, y: detourY },
    { x: stubX2, y: detourY },
    { x: stubX2, y: entryPort.y },
    { x: entryPort.x, y: entryPort.y },
  ];
}

function routeVertical(
  exitPort: PortInfo,
  entryPort: PortInfo,
  exitSide: Side,
  sourcePos: NodePosition,
  targetPos: NodePosition,
  allNodes: NodePosition[],
  channelUsage: Map<number, number>,
  channelOffset: number,
  padding: number,
): Waypoint[] {
  const goDown = exitSide === 'bottom';
  const stubY1 = exitPort.y + (goDown ? padding : -padding);
  const stubY2 = entryPort.y + (goDown ? -padding : padding);

  const gapOk = goDown
    ? (stubY1 + 20 < stubY2)
    : (stubY2 + 20 < stubY1);

  if (gapOk) {
    const baseChannelY = Math.round((stubY1 + stubY2) / 2);
    const usage = channelUsage.get(baseChannelY) ?? 0;
    channelUsage.set(baseChannelY, usage + 1);
    const halfIndex = Math.ceil(usage / 2);
    const sign = usage % 2 === 0 ? 1 : -1;
    const channelY = baseChannelY + halfIndex * channelOffset * sign;

    return [
      { x: exitPort.x, y: exitPort.y },
      { x: exitPort.x, y: stubY1 },
      { x: exitPort.x, y: channelY },
      { x: entryPort.x, y: channelY },
      { x: entryPort.x, y: stubY2 },
      { x: entryPort.x, y: entryPort.y },
    ];
  }

  const above = Math.min(sourcePos.y, targetPos.y) - 80;
  const below = Math.max(sourcePos.y + sourcePos.height, targetPos.y + targetPos.height) + 80;
  const detourY = goDown ? below : above;
  const detourX = Math.max(sourcePos.x + sourcePos.width, targetPos.x + targetPos.width) + 60;

  return [
    { x: exitPort.x, y: exitPort.y },
    { x: exitPort.x, y: stubY1 },
    { x: detourX, y: stubY1 },
    { x: detourX, y: detourY },
    { x: entryPort.x, y: detourY },
    { x: entryPort.x, y: stubY2 },
    { x: entryPort.x, y: entryPort.y },
  ];
}

function isNodeObstructed(
  x: number,
  yMin: number,
  yMax: number,
  node: NodePosition,
  sourcePos: NodePosition,
  targetPos: NodePosition,
  margin: number,
): boolean {
  if (node === sourcePos || node === targetPos) return false;
  return (
    x >= node.x - margin &&
    x <= node.x + node.width + margin &&
    yMax >= node.y - margin &&
    yMin <= node.y + node.height + margin
  );
}

function findClearChannelX(
  preferredX: number,
  yMin: number,
  yMax: number,
  allNodes: NodePosition[],
  sourcePos: NodePosition,
  targetPos: NodePosition,
): number {
  const margin = 12;
  const isObstructed = (x: number) =>
    allNodes.some(n => isNodeObstructed(x, yMin, yMax, n, sourcePos, targetPos, margin));

  if (!isObstructed(preferredX)) return preferredX;

  for (let offset = 20; offset < 300; offset += 20) {
    if (!isObstructed(preferredX + offset)) return preferredX + offset;
    if (!isObstructed(preferredX - offset)) return preferredX - offset;
  }

  return Math.max(...allNodes.map(n => n.x + n.width)) + 40;
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
