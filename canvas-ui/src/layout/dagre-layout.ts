import dagre from '@dagrejs/dagre';
import type { MrGraph, MrFileNode, MrEdge } from '../types';
import { getChangedLines } from '../utils/diff-utils';
import { dimensions } from '../theme/tokens';

export interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  positions: Map<string, NodePosition>;
  groups: { name: string; x: number; y: number; width: number; height: number }[];
  graphWidth: number;
  graphHeight: number;
}

/**
 * Two-level layout:
 * 1. Use dagre to lay out files WITHIN each project group (based on intra-group edges)
 * 2. Compute each group's bounding box from its internal layout
 * 3. Use dagre to lay out project groups relative to each other (based on cross-group edges)
 * 4. Offset all file positions by their group's final position
 */
export function computeLayout(
  graph: MrGraph,
  nodeWidth: number = 520,
  rankDirection: string = 'LR'
): LayoutResult {
  const positions = new Map<string, NodePosition>();
  const groups: LayoutResult['groups'] = [];

  if (graph.files.length === 0) {
    return { positions, groups, graphWidth: 0, graphHeight: 0 };
  }

  const groupPadding = dimensions.groupPadding;
  const groupLabelHeight = dimensions.groupLabelHeight;

  // ── Step 0: Group files by project, build lookup ───────────────────

  const filesByProject = new Map<string, MrFileNode[]>();
  const fileToProject = new Map<string, string>();
  const fileIdSet = new Set(graph.files.map(f => f.id));

  for (const file of graph.files) {
    const proj = file.projectName || 'Other';
    if (!filesByProject.has(proj)) filesByProject.set(proj, []);
    filesByProject.get(proj)!.push(file);
    fileToProject.set(file.id, proj);
  }

  // Classify edges as intra-group or cross-group
  const intraEdges = new Map<string, MrEdge[]>(); // project -> edges within that project
  const crossEdges: MrEdge[] = [];

  for (const edge of graph.edges) {
    if (!fileIdSet.has(edge.fromFileId) || !fileIdSet.has(edge.toFileId)) continue;
    const fromProj = fileToProject.get(edge.fromFileId);
    const toProj = fileToProject.get(edge.toFileId);
    if (fromProj && toProj && fromProj === toProj) {
      if (!intraEdges.has(fromProj)) intraEdges.set(fromProj, []);
      intraEdges.get(fromProj)!.push(edge);
    } else {
      crossEdges.push(edge);
    }
  }

  // ── Step 1: Layout files within each project using dagre ───────────

  interface InternalLayout {
    name: string;
    localPositions: Map<string, NodePosition>; // positions relative to (0,0)
    width: number;
    height: number;
  }

  const internalLayouts: InternalLayout[] = [];

  for (const [projName, projFiles] of filesByProject) {
    const projEdges = intraEdges.get(projName) ?? [];

    if (projFiles.length === 1) {
      // Single file — no layout needed
      const h = estimateNodeHeight(projFiles[0]);
      const localPositions = new Map<string, NodePosition>();
      localPositions.set(projFiles[0].id, { x: 0, y: 0, width: nodeWidth, height: h });
      internalLayouts.push({
        name: projName,
        localPositions,
        width: nodeWidth,
        height: h,
      });
      continue;
    }

    // Use dagre for intra-group layout
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: rankDirection,
      nodesep: dimensions.intraNodesep,
      ranksep: dimensions.intraRanksep,
      edgesep: dimensions.intraEdgesep,
      marginx: 0,
      marginy: 0,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const file of projFiles) {
      g.setNode(file.id, { width: nodeWidth, height: estimateNodeHeight(file) });
    }
    for (const edge of projEdges) {
      if (g.hasNode(edge.fromFileId) && g.hasNode(edge.toFileId)) {
        g.setEdge(edge.fromFileId, edge.toFileId);
      }
    }

    dagre.layout(g);

    // Extract positions, normalize to (0,0) origin
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const rawPositions = new Map<string, NodePosition>();
    for (const nodeId of g.nodes()) {
      const node = g.node(nodeId);
      if (!node) continue;
      const pos: NodePosition = {
        x: node.x - node.width / 2,
        y: node.y - node.height / 2,
        width: node.width,
        height: node.height,
      };
      rawPositions.set(nodeId, pos);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    }

    const localPositions = new Map<string, NodePosition>(
      Array.from(rawPositions).map(([id, pos]) => [
        id,
        { ...pos, x: pos.x - minX, y: pos.y - minY },
      ])
    );

    internalLayouts.push({
      name: projName,
      localPositions,
      width: maxX - minX,
      height: maxY - minY,
    });
  }

  // ── Step 2: Layout project groups using dagre ──────────────────────

  const groupGraph = new dagre.graphlib.Graph();
  groupGraph.setGraph({
    rankdir: rankDirection,
    nodesep: dimensions.interNodesep,
    ranksep: dimensions.interRanksep,
    marginx: dimensions.interMargin,
    marginy: dimensions.interMargin,
  });
  groupGraph.setDefaultEdgeLabel(() => ({}));

  for (const il of internalLayouts) {
    const totalWidth = il.width + groupPadding * 2;
    const totalHeight = il.height + groupPadding * 2 + groupLabelHeight;
    groupGraph.setNode(il.name, { width: totalWidth, height: totalHeight });
  }

  // Add cross-group edges
  const addedGroupEdges = new Set<string>();
  for (const edge of crossEdges) {
    const fromProj = fileToProject.get(edge.fromFileId);
    const toProj = fileToProject.get(edge.toFileId);
    if (fromProj && toProj) {
      const key = `${fromProj}->${toProj}`;
      if (!addedGroupEdges.has(key)) {
        addedGroupEdges.add(key);
        groupGraph.setEdge(fromProj, toProj);
      }
    }
  }

  dagre.layout(groupGraph);

  // ── Step 3: Combine — offset internal positions by group position ──

  let graphWidth = 0;
  let graphHeight = 0;

  for (const il of internalLayouts) {
    const groupNode = groupGraph.node(il.name);
    if (!groupNode) continue;

    const groupX = groupNode.x - groupNode.width / 2;
    const groupY = groupNode.y - groupNode.height / 2;
    const innerX = groupX + groupPadding;
    const innerY = groupY + groupPadding + groupLabelHeight;

    for (const [fileId, localPos] of il.localPositions) {
      const pos: NodePosition = {
        x: innerX + localPos.x,
        y: innerY + localPos.y,
        width: localPos.width,
        height: localPos.height,
      };
      positions.set(fileId, pos);
      graphWidth = Math.max(graphWidth, pos.x + pos.width);
      graphHeight = Math.max(graphHeight, pos.y + pos.height);
    }

    groups.push({
      name: il.name,
      x: groupX,
      y: groupY,
      width: groupNode.width,
      height: groupNode.height,
    });
  }

  resolveContainerOverlaps(groups, positions, fileToProject, dimensions.containerMinGap);

  graphWidth = 0;
  graphHeight = 0;
  for (const pos of positions.values()) {
    graphWidth = Math.max(graphWidth, pos.x + pos.width);
    graphHeight = Math.max(graphHeight, pos.y + pos.height);
  }

  return { positions, groups, graphWidth: graphWidth + 50, graphHeight: graphHeight + 50 };
}

/**
 * Estimate the rendered height of a node based on its content.
 * This is used for dagre layout — the actual canvas painting may differ slightly.
 */
function resolveContainerOverlaps(
  groups: LayoutResult['groups'],
  positions: Map<string, NodePosition>,
  fileToProject: Map<string, string>,
  minGap: number
) {
  if (groups.length < 2) return;

  const MAX_ITERATIONS = 5;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let worstOverlap = 0;
    let worstI = -1;
    let worstJ = -1;

    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i];
        const b = groups[j];

        const overlapX = Math.min(a.x + a.width + minGap, b.x + b.width + minGap) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height + minGap, b.y + b.height + minGap) - Math.max(a.y, b.y);

        if (overlapX > 0 && overlapY > 0) {
          const area = overlapX * overlapY;
          if (area > worstOverlap) {
            worstOverlap = area;
            worstI = i;
            worstJ = j;
          }
        }
      }
    }

    if (worstI === -1) break;

    const a = groups[worstI];
    const b = groups[worstJ];

    const overlapX = Math.min(a.x + a.width + minGap, b.x + b.width + minGap) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.height + minGap, b.y + b.height + minGap) - Math.max(a.y, b.y);

    if (overlapX < overlapY) {
      const shift = overlapX / 2;
      const sign = a.x < b.x ? 1 : -1;
      moveGroup(b, positions, fileToProject, sign * shift, 0);
      moveGroup(a, positions, fileToProject, -sign * shift, 0);
    } else {
      const shift = overlapY / 2;
      const sign = a.y < b.y ? 1 : -1;
      moveGroup(b, positions, fileToProject, 0, sign * shift);
      moveGroup(a, positions, fileToProject, 0, -sign * shift);
    }
  }
}

function moveGroup(
  group: LayoutResult['groups'][0],
  positions: Map<string, NodePosition>,
  fileToProject: Map<string, string>,
  dx: number,
  dy: number
) {
  group.x += dx;
  group.y += dy;

  for (const [fileId, pos] of positions) {
    if (fileToProject.get(fileId) === group.name) {
      pos.x += dx;
      pos.y += dy;
    }
  }
}

function estimateNodeHeight(file: MrFileNode): number {
  const headerHeight = dimensions.headerHeight;
  const lineHeight = dimensions.lineHeight;
  const maxPreviewLines = dimensions.maxPreviewLines;

  if (!file.sections || file.sections.length === 0) {
    return headerHeight + 60;
  }

  const visibleLines = getChangedLines(file);
  if (visibleLines.length === 0) {
    return headerHeight + 40;
  }

  return headerHeight + visibleLines.length * lineHeight + 12;
}
