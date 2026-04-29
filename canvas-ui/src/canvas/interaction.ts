import {
  zoom, panX, panY, setZoom, setPan, markDirty,
  selectedNodeId, expandedNodeId, selectNode, expandNode, hoverNode, hoverEdge, screenToWorld,
  layoutLocked, viewMode, toggleProjectExpanded, expandedProjects
} from '../state/ui-store';
import { nodePositions, updateNodePosition, arrowRoutes, rerouteArrows, archLayout, forceNodes, getActiveSimulation } from '../state/graph-store';
import { getDPR } from './canvas-renderer';
import { hitTestGraphNode } from './class-graph-painter';
import { dimensions } from '../theme/tokens';

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
  if (viewMode.value === 'graph') {
    return hitTestGraphNode(worldX, worldY, forceNodes.value);
  }
  if (viewMode.value === 'arch') {
    return hitTestArchNode(worldX, worldY);
  }
  const positions = nodePositions.value;
  const entries = Array.from(positions.entries()).reverse();
  for (const [id, pos] of entries) {
    if (worldX >= pos.x && worldX <= pos.x + pos.width &&
        worldY >= pos.y && worldY <= pos.y + pos.height) {
      return id;
    }
  }
  return null;
}

function hitTestArchNode(worldX: number, worldY: number): string | null {
  const layout = archLayout.value;
  if (!layout) return null;

  const expanded = expandedProjects.value;
  for (const projName of expanded) {
    const projNode = layout.projectNodes.get(projName);
    if (!projNode) continue;
    for (const file of projNode.files) {
      const subPos = layout.subNodePositions.get(file.id);
      if (!subPos) continue;
      if (worldX >= subPos.x && worldX <= subPos.x + subPos.width &&
          worldY >= subPos.y && worldY <= subPos.y + subPos.height) {
        return file.id;
      }
    }
  }

  for (const [projName, pos] of layout.projectPositions) {
    if (worldX >= pos.x && worldX <= pos.x + pos.width &&
        worldY >= pos.y && worldY <= pos.y + pos.height) {
      return `arch:${projName}`;
    }
  }
  return null;
}

function hitTestEdge(worldX: number, worldY: number): number | null {
  const routes = arrowRoutes.value;
  const threshold = dimensions.edgeHitThreshold;

  for (let i = 0; i < routes.length; i++) {
    const poly = routes[i].hitPoly;
    for (let j = 0; j < poly.length - 1; j++) {
      const a = poly[j];
      const b = poly[j + 1];
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
    if (viewMode.value === 'arch' && hitNode.startsWith('arch:')) {
      const projName = hitNode.slice(5);
      toggleProjectExpanded(projName);
      return;
    }
    selectNode(hitNode);
    if (viewMode.value === 'graph') {
      isDragging = true;
      dragNodeId = hitNode;
      const node = forceNodes.value.find(n => n.id === hitNode);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
        const sim = getActiveSimulation();
        if (sim) sim.alphaTarget(0.3).restart();
      }
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (!layoutLocked.value && viewMode.value === 'diff') {
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
    if (viewMode.value === 'graph') {
      const node = forceNodes.value.find(n => n.id === dragNodeId);
      if (node) {
        node.fx = world.x;
        node.fy = world.y;
      }
      markDirty();
      return;
    }
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
  if (viewMode.value === 'graph' && dragNodeId) {
    const node = forceNodes.value.find(n => n.id === dragNodeId);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    const sim = getActiveSimulation();
    if (sim) sim.alphaTarget(0);
  }
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
    if (viewMode.value === 'arch' && hitNode.startsWith('arch:')) {
      return;
    }
    if (viewMode.value === 'diff') {
      expandNode(hitNode);
    }
  }
}
