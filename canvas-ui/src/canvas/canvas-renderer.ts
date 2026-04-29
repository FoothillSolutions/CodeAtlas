import { effect } from '@preact/signals';
import { nodePositions, arrowRoutes, files, projectGroups, glyphDataMap, archLayout, forceNodes, forceLinks } from '../state/graph-store';
import type { ForceNode } from '../layout/force-layout';
import type { NodePosition } from '../layout/dagre-layout';
import type { MrFileNode } from '../types';
import {
  zoom, panX, panY, selectedNodeId, hoveredNodeId, hoveredEdgeIndex,
  canvasDirty, searchQuery, activeFilters,
  activeOverlays, getEffectiveLodTier, lodPinMode, lodFadeStates,
  viewMode, expandedProjects,
  type LodTier, type LodFadeState
} from '../state/ui-store';
import { getReviewStatus } from '../state/review-store';
import { getRiskColor, getRiskBorderColor, getRiskLabel } from '../state/analysis-store';
import { paintNode, paintDotNode, paintGlyphNode, roundRect } from './node-painter';
import { paintArrow } from './arrow-painter';
import { paintProjectNode, paintArchEdge, paintFileSubNode, paintFolderLabel } from './project-painter';
import { updateLodFades, paintTier } from './lod-fade-manager';
import { paintDiffLabels } from './label-painter';
import { paintGraphEdges, paintGraphNodes } from './class-graph-painter';
import { colors, dimensions, fonts, fontStrings } from '../theme/tokens';

interface ViewportBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let dpr = 1;
let rafId: number | null = null;
let effectDisposer: (() => void) | null = null;
let lastFrameTime = 0;

export function initCanvas(canvasElement: HTMLCanvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d')!;
  dpr = window.devicePixelRatio || 1;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

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
  effectDisposer = effect(() => {
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
    activeOverlays.value;
    lodPinMode.value;
    viewMode.value;
    expandedProjects.value;
    archLayout.value;
    forceNodes.value;
    forceLinks.value;

    canvasDirty.value = true;
  });

  lastFrameTime = performance.now();

  function frame(now: number) {
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    const needsFadeUpdate = updateLodFades(dt);
    if (needsFadeUpdate) canvasDirty.value = true;

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

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = colors.bg.canvas;
  ctx.fillRect(0, 0, width, height);

  ctx.save();

  ctx.scale(dpr, dpr);

  ctx.translate(panX.value, panY.value);
  ctx.scale(zoom.value, zoom.value);

  if (viewMode.value === 'graph') {
    renderGraphMode(ctx, width, height, dpr);
  } else if (viewMode.value === 'arch') {
    renderArchMode(ctx, width, height, dpr);
  } else {
    renderDiffMode(ctx, width, height, dpr);
  }

  ctx.restore();

  if (viewMode.value === 'diff') {
    paintDiffLabels(ctx, width, height, dpr);
  }
}

function renderGraphMode(
  ctx: CanvasRenderingContext2D,
  _canvasWidth: number,
  _canvasHeight: number,
  _devicePixelRatio: number,
) {
  const nodes = forceNodes.value;
  const links = forceLinks.value;
  const selected = selectedNodeId.value;
  const hovered = hoveredNodeId.value;

  if (nodes.length === 0) return;

  const maxRisk = Math.max(1, ...nodes.map(n => n.riskScore));

  let highlightedIds: Set<string> | null = null;
  if (selected) {
    highlightedIds = new Set([selected]);
    for (const link of links) {
      const s = (link.source as ForceNode).id ?? (link.source as string);
      const t = (link.target as ForceNode).id ?? (link.target as string);
      if (s === selected || t === selected) {
        highlightedIds.add(s);
        highlightedIds.add(t);
      }
    }
  }

  paintGraphEdges(ctx, links, maxRisk, highlightedIds);
  paintGraphNodes(ctx, nodes, maxRisk, selected, hovered, highlightedIds);
}

function renderArchMode(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  devicePixelRatio: number,
) {
  const layout = archLayout.value;
  if (!layout) return;

  const hovered = hoveredNodeId.value;
  const expanded = expandedProjects.value;

  for (const edge of layout.projectEdges) {
    const fromPos = layout.projectPositions.get(edge.fromProject);
    const toPos = layout.projectPositions.get(edge.toProject);
    if (fromPos && toPos) {
      paintArchEdge(ctx, fromPos, toPos, edge.interfaceName, edge.parallelIndex, edge.parallelTotal);
    }
  }

  for (const [projName, pos] of layout.projectPositions) {
    const projNode = layout.projectNodes.get(projName);
    if (!projNode) continue;
    const isExpanded = expanded.has(projName);
    const isHovered = hovered === `arch:${projName}`;
    paintProjectNode(ctx, projNode, pos, { isExpanded, isHovered });

    if (isExpanded) {
      const groups = layout.folderGroupsByProject.get(projName);
      if (groups) {
        for (const group of groups) {
          const firstFile = group.files[0];
          const firstPos = layout.subNodePositions.get(firstFile?.id ?? '');
          if (firstPos) {
            const labelY = firstPos.y - 18 - 4;
            paintFolderLabel(ctx, group.folderPath, pos.x, labelY, pos.width);
          }
          for (const file of group.files) {
            const subPos = layout.subNodePositions.get(file.id);
            if (!subPos) continue;
            const isSubHovered = hovered === file.id;
            paintFileSubNode(ctx, file.fileName, file.isChanged, subPos, isSubHovered);
          }
        }
      }
    }
  }
}

function computeConnectedIds(selected: string | null, routes: typeof arrowRoutes.value): Set<string> | null {
  if (!selected) return null;
  const ids = new Set<string>([selected]);
  for (const route of routes) {
    if (route.fromFileId === selected || route.toFileId === selected) {
      ids.add(route.fromFileId);
      ids.add(route.toFileId);
    }
  }
  return ids;
}

function renderProjectGroups(
  ctx: CanvasRenderingContext2D,
  groups: typeof projectGroups.value,
  vp: ViewportBounds,
) {
  for (const group of groups) {
    if (group.x + group.width < vp.x || group.x > vp.x + vp.w ||
        group.y + group.height < vp.y || group.y > vp.y + vp.h) {
      continue;
    }

    ctx.save();

    ctx.fillStyle = colors.container.fill;
    ctx.strokeStyle = colors.container.stroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    roundRect(ctx, group.x, group.y, group.width, group.height, 12);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = fontStrings.ui13bold;
    ctx.fillStyle = colors.container.label;
    ctx.textBaseline = 'top';
    ctx.fillText(group.name, group.x + 12, group.y + 6);

    ctx.restore();
  }
}

function renderEdges(
  ctx: CanvasRenderingContext2D,
  routes: typeof arrowRoutes.value,
  connectedEdgeIndices: Set<number> | null,
  hoveredEdge: number | null,
  vp: ViewportBounds,
) {
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const visible = route.waypoints.some(wp =>
      wp.x >= vp.x - 100 && wp.x <= vp.x + vp.w + 100 &&
      wp.y >= vp.y - 100 && wp.y <= vp.y + vp.h + 100
    );
    if (!visible) continue;

    const isConnectedArrow = !connectedEdgeIndices || connectedEdgeIndices.has(i);

    ctx.save();
    if (connectedEdgeIndices && !isConnectedArrow) {
      ctx.globalAlpha = 0.1;
    }
    paintArrow(ctx, route, {
      isHovered: hoveredEdge === i,
    });
    ctx.restore();
  }
}

function renderNodes(
  ctx: CanvasRenderingContext2D,
  allFiles: MrFileNode[],
  positions: Map<string, NodePosition>,
  glyphs: Map<string, import('../state/graph-store').GlyphLine[]>,
  fadeStates: Map<string, LodFadeState>,
  vp: ViewportBounds,
  nodeOpts: {
    selected: string | null;
    hovered: string | null;
    connectedIds: Set<string> | null;
    query: string;
    currentZoom: number;
  },
) {
  for (const file of allFiles) {
    const pos = positions.get(file.id);
    if (!pos) continue;

    if (pos.x + pos.width < vp.x || pos.x > vp.x + vp.w ||
        pos.y + pos.height < vp.y || pos.y > vp.y + vp.h) {
      continue;
    }

    const reviewStatus = getReviewStatus(file.filePath);
    const reviewFilter = activeFilters.value.reviewStatus;
    const dimmedBySearch = nodeOpts.query.length > 0 && !file.fileName.toLowerCase().includes(nodeOpts.query);
    const dimmedByReview = reviewFilter !== null && reviewFilter !== undefined && (
      reviewFilter === 'unreviewed' ? reviewStatus !== 'unreviewed'
      : reviewFilter === 'flagged' ? reviewStatus !== 'flagged'
      : reviewFilter === 'reviewed' ? reviewStatus !== 'reviewed'
      : reviewFilter === 'needs-attention' ? reviewStatus !== 'needs-attention'
      : false
    );
    const dimmedBySelection = nodeOpts.connectedIds !== null && !nodeOpts.connectedIds.has(file.id);
    const isDimmed = dimmedBySearch || dimmedByReview || dimmedBySelection;

    const overlayData = {
      riskFill: activeOverlays.value.has('risk-heatmap') ? getRiskColor(file.id) : null,
      riskBorder: activeOverlays.value.has('risk-heatmap') ? getRiskBorderColor(file.id) : null,
      riskLabel: activeOverlays.value.has('risk-heatmap') ? getRiskLabel(file.id) : null,
      impactRadius: activeOverlays.value.has('critical-paths') ? (file.impactRadius ?? 0) : 0,
    };

    const opts = {
      isSelected: nodeOpts.selected === file.id,
      isHovered: nodeOpts.hovered === file.id,
      isDimmed,
      reviewStatus,
    };

    const fadeState = fadeStates.get(file.id);
    if (!fadeState || fadeState.t >= 1) {
      paintTier(ctx, fadeState?.targetTier ?? getEffectiveLodTier(), file, pos, nodeOpts.currentZoom, opts, overlayData, glyphs, 1);
    } else {
      paintTier(ctx, fadeState.currentTier, file, pos, nodeOpts.currentZoom, opts, overlayData, glyphs, 1 - fadeState.t);
      paintTier(ctx, fadeState.targetTier, file, pos, nodeOpts.currentZoom, opts, overlayData, glyphs, fadeState.t);
    }
  }
}

function renderDiffMode(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  devicePixelRatio: number,
) {
  const positions = nodePositions.value;
  const routes = arrowRoutes.value;
  const allFiles = files.value;
  const currentZoom = zoom.value;
  const selected = selectedNodeId.value;
  const hovered = hoveredNodeId.value;
  const hoveredEdge = hoveredEdgeIndex.value;
  const query = searchQuery.value.toLowerCase();
  const glyphs = glyphDataMap.value;
  const fadeStates = lodFadeStates.value;

  const vp: ViewportBounds = {
    x: -panX.value / currentZoom,
    y: -panY.value / currentZoom,
    w: (canvasWidth / devicePixelRatio) / currentZoom,
    h: (canvasHeight / devicePixelRatio) / currentZoom,
  };

  renderProjectGroups(ctx, projectGroups.value, vp);

  let connectedIds: Set<string> | null = null;
  let connectedEdgeIndices: Set<number> | null = null;
  if (selected) {
    connectedIds = computeConnectedIds(selected, routes);
    connectedEdgeIndices = new Set<number>();
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      if (route.fromFileId === selected || route.toFileId === selected) {
        connectedEdgeIndices.add(i);
      }
    }
  }

  renderEdges(ctx, routes, connectedEdgeIndices, hoveredEdge, vp);

  renderNodes(ctx, allFiles, positions, glyphs, fadeStates, vp, {
    selected,
    hovered,
    connectedIds,
    query,
    currentZoom,
  });
}

export function getCanvasElement(): HTMLCanvasElement | null {
  return canvas;
}

export function getDPR(): number {
  return dpr;
}
