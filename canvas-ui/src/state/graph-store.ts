import { signal, computed } from '@preact/signals';
import type { MrGraph, MrFileNode, MrEdge } from '../types';
import { routeArrows } from '../layout/arrow-router';
import { computeLayout } from '../layout/dagre-layout';
import { flattenRouteToPoly } from '../canvas/arrow-painter';
import { computeArchLayout, type ArchLayoutResult } from '../layout/arch-layout';
import { expandedProjects, initExpandedProjects } from '../state/ui-store';

export interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowRoute {
  edgeId: string;
  waypoints: { x: number; y: number }[];
  hitPoly: { x: number; y: number }[];
  fromFileId: string;
  toFileId: string;
  type: string; // "di" | "calls" | "di-ghost"
  interfaceName: string;
  paramName?: string;
  methodCalls: string[];
}

export interface ProjectGroup {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Raw graph data from the JSON blob
export const graphData = signal<MrGraph | null>(null);

// Project group bounding boxes (set by layout engine)
export const projectGroups = signal<ProjectGroup[]>([]);

// Computed node positions (set by layout engine)
export const nodePositions = signal<Map<string, NodePosition>>(new Map());

// Computed arrow routes (set by arrow router)
export const arrowRoutes = signal<ArrowRoute[]>([]);

// Architecture view layout result
export const archLayout = signal<ArchLayoutResult | null>(null);

// Derived: all files
export const files = computed(() => graphData.value?.files ?? []);

// Derived: all edges
export const edges = computed(() => graphData.value?.edges ?? []);

// Derived: changed files only
export const changedFiles = computed(() => files.value.filter(f => f.isChanged));

// Derived: ghost (unchanged) files
export const ghostFiles = computed(() => files.value.filter(f => !f.isChanged));

// Derived: branch name
export const branchName = computed(() => graphData.value?.branchName ?? '');
export const repoName = computed(() => graphData.value?.repoName ?? '');

// Derived: stats
export const stats = computed(() => ({
  totalFiles: graphData.value?.totalFiles ?? 0,
  totalAdditions: graphData.value?.totalAdditions ?? 0,
  totalDeletions: graphData.value?.totalDeletions ?? 0,
  analyzedFiles: files.value.length,
}));

// ── Glyph data for LOD tier ────────────────────────────────────────────

export type GlyphCategory = 'import' | 'class' | 'method' | 'property' | 'comment' | 'other';

export interface GlyphLine {
  category: GlyphCategory;
  diffType: string;
  length: number;
}

const GLYPH_PATTERNS: [RegExp, GlyphCategory][] = [
  [/^\s*(using |import |from |require\()/, 'import'],
  [/^\s*(public |private |protected |internal )?\s*(class |interface |struct |enum |record |abstract )/, 'class'],
  [/^\s*(public |private |protected |internal |static |async |override |virtual )*(void |Task|string|int|bool|var |[A-Z]\w*\s)\s*\w+\s*[(<]/, 'method'],
  [/^\s*(public |private |protected |internal |static |readonly )*(get |set |\w+\s+(=>|{))/, 'property'],
  [/^\s*(\/\/|\/\*|\*|#)/, 'comment'],
];

function classifyLine(text: string): GlyphCategory {
  for (const [pattern, category] of GLYPH_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return 'other';
}

function computeGlyphsForFile(file: MrFileNode): GlyphLine[] {
  const result: GlyphLine[] = [];
  for (const section of file.sections) {
    for (const line of section.lines) {
      result.push({
        category: classifyLine(line.text),
        diffType: line.diffType,
        length: line.text.length,
      });
    }
  }
  return result;
}

// Cached glyph data per file — computed once when graph data changes
export const glyphDataMap = computed<Map<string, GlyphLine[]>>(() => {
  const allFiles = files.value;
  const map = new Map<string, GlyphLine[]>();
  for (const file of allFiles) {
    map.set(file.id, computeGlyphsForFile(file));
  }
  return map;
});

// Initialize from JSON data
export function initGraph(data: MrGraph) {
  graphData.value = data;
}

// Update a single node's position (used during drag)
export function updateNodePosition(nodeId: string, x: number, y: number) {
  const positions = new Map(nodePositions.value);
  const existing = positions.get(nodeId);
  if (existing) {
    positions.set(nodeId, { ...existing, x, y });
    nodePositions.value = positions;
  }
}

// Set all positions at once (used after layout)
export function setNodePositions(positions: Map<string, NodePosition>) {
  nodePositions.value = positions;
}

// Set arrow routes (used after routing)
export function setArrowRoutes(routes: ArrowRoute[]) {
  arrowRoutes.value = routes;
}

// Set project groups (used after layout)
export function setProjectGroups(groups: ProjectGroup[]) {
  projectGroups.value = groups;
}

// Re-route all arrows using current positions (called after node drag)
export function rerouteArrows() {
  const data = graphData.value;
  if (!data) return;
  arrowRoutes.value = buildArrowRoutes(data.edges, nodePositions.value);
}

export function relayout(data: MrGraph) {
  const config = data.config;
  const nw = config?.nodeWidth ?? 520;
  const rd = config?.rankDirection ?? 'LR';

  const result = computeLayout(data, nw, rd);

  nodePositions.value = result.positions;
  projectGroups.value = result.groups;
  arrowRoutes.value = buildArrowRoutes(data.edges, result.positions);

  return result;
}

function buildArrowRoutes(
  edges: MrGraph['edges'],
  positions: Map<string, NodePosition>,
): ArrowRoute[] {
  return routeArrows(edges, positions).map((r, i) => ({
    edgeId: `edge-${i}`,
    waypoints: r.waypoints,
    hitPoly: flattenRouteToPoly(r.waypoints),
    fromFileId: r.edge.fromFileId,
    toFileId: r.edge.toFileId,
    type: r.edge.type,
    interfaceName: r.edge.interfaceName,
    paramName: r.edge.paramName,
    methodCalls: r.edge.methodCalls,
  }));
}

let archInitialized = false;

export function relayoutArch(data: MrGraph, expanded: Set<string>) {
  if (!archInitialized) {
    archInitialized = true;
    const allProjects = [...new Set(data.files.map(f => f.projectName || 'Other'))];
    initExpandedProjects(allProjects);
    expanded = new Set(allProjects);
  }
  const result = computeArchLayout(data, expanded);
  archLayout.value = result;
  return result;
}
