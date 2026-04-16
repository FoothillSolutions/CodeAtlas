import dagre from '@dagrejs/dagre';
import type { MrGraph, MrFileNode, MrEdge } from '../types';

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

  const groupPadding = 30;
  const groupLabelHeight = 28;

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
      nodesep: 40,
      ranksep: 60,
      edgesep: 15,
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

    // Extract positions and normalize to (0,0) origin
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

    // Normalize to (0,0) origin
    const localPositions = new Map<string, NodePosition>();
    for (const [id, pos] of rawPositions) {
      localPositions.set(id, {
        x: pos.x - minX,
        y: pos.y - minY,
        width: pos.width,
        height: pos.height,
      });
    }

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
    nodesep: 80,
    ranksep: 250,
    marginx: 50,
    marginy: 50,
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

  return { positions, groups, graphWidth: graphWidth + 50, graphHeight: graphHeight + 50 };
}

/**
 * Estimate the rendered height of a node based on its content.
 * This is used for dagre layout — the actual canvas painting may differ slightly.
 */
function estimateNodeHeight(file: MrFileNode): number {
  const headerHeight = 36;
  const lineHeight = 16;
  const maxPreviewLines = 8;

  if (!file.sections || file.sections.length === 0) {
    return headerHeight + 60;
  }

  let totalLines = 0;
  for (const section of file.sections) {
    totalLines += section.lines.length;
  }

  const visibleLines = Math.min(totalLines, maxPreviewLines);
  return headerHeight + visibleLines * lineHeight + 12;
}
