import {
  zoom, panX, panY, setZoom, setPan, markDirty,
  selectedNodeId, expandedNodeId, selectNode, expandNode, hoverNode, hoverEdge, screenToWorld,
  layoutLocked
} from '../state/ui-store';
import { nodePositions, updateNodePosition, arrowRoutes, rerouteArrows } from '../state/graph-store';
import { getDPR } from './canvas-renderer';

let isPanning = false;
let isDragging = false;
let dragNodeId: string | null = null;
let startX = 0;
let startY = 0;
let dragOffsetX = 0;
let dragOffsetY = 0;
let lastClickTime = 0;

export function setupInteraction(canvas: HTMLCanvasElement) {
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDblClick);
}

export function cleanupInteraction(canvas: HTMLCanvasElement) {
  canvas.removeEventListener('mousedown', onMouseDown);
  canvas.removeEventListener('mousemove', onMouseMove);
  canvas.removeEventListener('mouseup', onMouseUp);
  canvas.removeEventListener('wheel', onWheel);
  canvas.removeEventListener('dblclick', onDblClick);
}

function getCanvasOffset(canvas: HTMLCanvasElement, e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function hitTestNode(worldX: number, worldY: number): string | null {
  const positions = nodePositions.value;
  // Iterate in reverse (top nodes first)
  const entries = Array.from(positions.entries()).reverse();
  for (const [id, pos] of entries) {
    if (worldX >= pos.x && worldX <= pos.x + pos.width &&
        worldY >= pos.y && worldY <= pos.y + pos.height) {
      return id;
    }
  }
  return null;
}

function hitTestEdge(worldX: number, worldY: number): number | null {
  const routes = arrowRoutes.value;
  const threshold = 8;

  for (let i = 0; i < routes.length; i++) {
    const waypoints = routes[i].waypoints;
    for (let j = 0; j < waypoints.length - 1; j++) {
      const a = waypoints[j];
      const b = waypoints[j + 1];
      const dist = pointToSegmentDistance(worldX, worldY, a.x, a.y, b.x, b.y);
      if (dist < threshold) return i;
    }
  }
  return null;
}

function pointToSegmentDistance(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

function onMouseDown(e: MouseEvent) {
  const canvas = e.target as HTMLCanvasElement;
  const offset = getCanvasOffset(canvas, e);
  const world = screenToWorld(offset.x, offset.y);

  const hitNode = hitTestNode(world.x, world.y);

  if (hitNode) {
    selectNode(hitNode);
    if (!layoutLocked.value) {
      isDragging = true;
      dragNodeId = hitNode;
      const pos = nodePositions.value.get(hitNode)!;
      dragOffsetX = world.x - pos.x;
      dragOffsetY = world.y - pos.y;
      canvas.style.cursor = 'grabbing';
    }
  } else {
    // Clicked empty space — close expanded card and deselect
    if (expandedNodeId.value) {
      expandNode(null);
    }
    selectNode(null);
    // Start panning
    isPanning = true;
    startX = e.clientX - panX.value;
    startY = e.clientY - panY.value;
    canvas.style.cursor = 'grabbing';
  }
}

function onMouseMove(e: MouseEvent) {
  const canvas = e.target as HTMLCanvasElement;
  const offset = getCanvasOffset(canvas, e);
  const world = screenToWorld(offset.x, offset.y);

  if (isPanning) {
    setPan(e.clientX - startX, e.clientY - startY);
    return;
  }

  if (isDragging && dragNodeId) {
    updateNodePosition(dragNodeId, world.x - dragOffsetX, world.y - dragOffsetY);
    rerouteArrows();
    markDirty();
    return;
  }

  // Hover detection
  const hitNode = hitTestNode(world.x, world.y);
  hoverNode(hitNode);

  if (!hitNode) {
    const hitEdgeIdx = hitTestEdge(world.x, world.y);
    hoverEdge(hitEdgeIdx);
  } else {
    hoverEdge(null);
  }

  // Update cursor
  canvas.style.cursor = hitNode ? 'pointer' : 'grab';
}

function onMouseUp(e: MouseEvent) {
  const canvas = e.target as HTMLCanvasElement;
  isPanning = false;
  isDragging = false;
  dragNodeId = null;
  canvas.style.cursor = 'grab';
}

function onWheel(e: WheelEvent) {
  e.preventDefault();

  const canvas = e.target as HTMLCanvasElement;
  const offset = getCanvasOffset(canvas, e);

  const delta = e.deltaY > 0 ? 0.92 : 1.08;
  const newZoom = Math.max(0.1, Math.min(3, zoom.value * delta));

  // Zoom around cursor position
  const wx = (offset.x - panX.value) / zoom.value;
  const wy = (offset.y - panY.value) / zoom.value;

  panX.value = offset.x - wx * newZoom;
  panY.value = offset.y - wy * newZoom;
  zoom.value = newZoom;
  markDirty();
}

function onDblClick(e: MouseEvent) {
  const canvas = e.target as HTMLCanvasElement;
  const offset = getCanvasOffset(canvas, e);
  const world = screenToWorld(offset.x, offset.y);

  const hitNode = hitTestNode(world.x, world.y);
  if (hitNode) {
    expandNode(hitNode);
  }
}
