import { effect } from '@preact/signals';
import { nodePositions, arrowRoutes, files, projectGroups } from '../state/graph-store';
import {
  zoom, panX, panY, selectedNodeId, hoveredNodeId, hoveredEdgeIndex,
  canvasDirty, searchQuery, activeFilters, semanticZoomEnabled, isCompactMode
} from '../state/ui-store';
import { getReviewStatus } from '../state/review-store';
import { paintNode, paintCompactNode, COLORS } from './node-painter';
import { paintArrow } from './arrow-painter';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let dpr = 1;
let rafId: number | null = null;
let effectDisposer: (() => void) | null = null;

export function initCanvas(canvasElement: HTMLCanvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d')!;
  dpr = window.devicePixelRatio || 1;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Start render loop
  startRenderLoop();
}

export function destroyCanvas() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  if (effectDisposer !== null) { effectDisposer(); effectDisposer = null; }
  window.removeEventListener('resize', resizeCanvas);
  canvas = null;
  ctx = null;
}

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvasDirty.value = true;
}

function startRenderLoop() {
  // Use Preact effect to watch for state changes; store disposer so destroyCanvas can clean it up
  effectDisposer = effect(() => {
    // Touch all signals we depend on to subscribe
    nodePositions.value;
    arrowRoutes.value;
    files.value;
    projectGroups.value;
    zoom.value;
    panX.value;
    panY.value;
    selectedNodeId.value;
    hoveredNodeId.value;
    hoveredEdgeIndex.value;
    searchQuery.value;
    activeFilters.value;
    semanticZoomEnabled.value;

    canvasDirty.value = true;
  });

  function frame() {
    if (canvasDirty.value) {
      render();
      canvasDirty.value = false;
    }
    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
}

function render() {
  if (!ctx || !canvas) return;

  const width = canvas.width;
  const height = canvas.height;

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, width, height);

  ctx.save();

  // Apply DPR scaling
  ctx.scale(dpr, dpr);

  // Apply pan and zoom
  ctx.translate(panX.value, panY.value);
  ctx.scale(zoom.value, zoom.value);

  const positions = nodePositions.value;
  const routes = arrowRoutes.value;
  const allFiles = files.value;
  const currentZoom = zoom.value;
  const currentPanX = panX.value;
  const currentPanY = panY.value;
  const compact = isCompactMode();
  const selected = selectedNodeId.value;
  const hovered = hoveredNodeId.value;
  const hoveredEdge = hoveredEdgeIndex.value;
  const query = searchQuery.value.toLowerCase();

  // Compute viewport in world coordinates for frustum culling
  const viewportX = -currentPanX / currentZoom;
  const viewportY = -currentPanY / currentZoom;
  const viewportW = (width / dpr) / currentZoom;
  const viewportH = (height / dpr) / currentZoom;

  // Draw project group backgrounds (behind everything)
  const groupList = projectGroups.value;
  for (const group of groupList) {
    // Frustum culling for groups
    if (group.x + group.width < viewportX || group.x > viewportX + viewportW ||
        group.y + group.height < viewportY || group.y > viewportY + viewportH) {
      continue;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(48, 54, 61, 0.2)';
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Rounded rect
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(group.x + r, group.y);
    ctx.lineTo(group.x + group.width - r, group.y);
    ctx.quadraticCurveTo(group.x + group.width, group.y, group.x + group.width, group.y + r);
    ctx.lineTo(group.x + group.width, group.y + group.height - r);
    ctx.quadraticCurveTo(group.x + group.width, group.y + group.height, group.x + group.width - r, group.y + group.height);
    ctx.lineTo(group.x + r, group.y + group.height);
    ctx.quadraticCurveTo(group.x, group.y + group.height, group.x, group.y + group.height - r);
    ctx.lineTo(group.x, group.y + r);
    ctx.quadraticCurveTo(group.x, group.y, group.x + r, group.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // Group label
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#8b949e';
    ctx.textBaseline = 'top';
    ctx.fillText(group.name, group.x + 12, group.y + 6);
    ctx.restore();
  }

  // Build the set of connected node IDs for dependency highlighting
  // When a node is selected, only it and its direct dependencies are fully visible
  let connectedIds: Set<string> | null = null;
  let connectedEdgeIndices: Set<number> | null = null;
  if (selected) {
    connectedIds = new Set<string>([selected]);
    connectedEdgeIndices = new Set<number>();
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      if (route.fromFileId === selected || route.toFileId === selected) {
        connectedIds.add(route.fromFileId);
        connectedIds.add(route.toFileId);
        connectedEdgeIndices.add(i);
      }
    }
  }

  // Draw arrows first (behind nodes)
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    // Simple visibility check: at least one waypoint in viewport
    const visible = route.waypoints.some(wp =>
      wp.x >= viewportX - 100 && wp.x <= viewportX + viewportW + 100 &&
      wp.y >= viewportY - 100 && wp.y <= viewportY + viewportH + 100
    );
    if (!visible) continue;

    // Dim arrows not connected to the selected node
    const isConnectedArrow = !connectedEdgeIndices || connectedEdgeIndices.has(i);

    ctx!.save();
    if (connectedEdgeIndices && !isConnectedArrow) {
      ctx!.globalAlpha = 0.1;
    }
    paintArrow(ctx!, route, {
      isHovered: hoveredEdge === i,
    });
    ctx!.restore();
  }

  // Draw nodes
  for (const file of allFiles) {
    const pos = positions.get(file.id);
    if (!pos) continue;

    // Frustum culling
    if (pos.x + pos.width < viewportX || pos.x > viewportX + viewportW ||
        pos.y + pos.height < viewportY || pos.y > viewportY + viewportH) {
      continue;
    }

    // Determine if dimmed by search or review status filter
    const reviewStatus = getReviewStatus(file.filePath);
    const reviewFilter = activeFilters.value.reviewStatus;
    const dimmedBySearch = query.length > 0 && !file.fileName.toLowerCase().includes(query);
    const dimmedByReview = reviewFilter !== null && reviewFilter !== undefined && (
      reviewFilter === 'unreviewed' ? reviewStatus !== 'unreviewed'
      : reviewFilter === 'flagged' ? reviewStatus !== 'flagged'
      : reviewFilter === 'reviewed' ? reviewStatus !== 'reviewed'
      : reviewFilter === 'needs-attention' ? reviewStatus !== 'needs-attention'
      : false
    );
    // Dim if not connected to selected node
    const dimmedBySelection = connectedIds !== null && !connectedIds.has(file.id);
    const isDimmed = dimmedBySearch || dimmedByReview || dimmedBySelection;

    if (compact) {
      paintCompactNode(ctx!, file, pos, currentZoom, {
        isSelected: selected === file.id,
        isHovered: hovered === file.id,
        isDimmed,
        reviewStatus,
      });
    } else {
      paintNode(ctx!, file, pos, {
        isSelected: selected === file.id,
        isHovered: hovered === file.id,
        isDimmed,
        reviewStatus,
      });
    }
  }

  ctx.restore();
}

// Export for hit testing to access canvas coordinates
export function getCanvasElement(): HTMLCanvasElement | null {
  return canvas;
}

export function getDPR(): number {
  return dpr;
}
