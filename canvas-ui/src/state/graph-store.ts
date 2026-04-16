import { signal, computed } from '@preact/signals';
import type { MrGraph, MrFileNode, MrEdge } from '../types';
import { routeArrows } from '../layout/arrow-router';

export interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowRoute {
  edgeId: string;
  waypoints: { x: number; y: number }[];
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

// Derived: stats
export const stats = computed(() => ({
  totalFiles: graphData.value?.totalFiles ?? 0,
  totalAdditions: graphData.value?.totalAdditions ?? 0,
  totalDeletions: graphData.value?.totalDeletions ?? 0,
  analyzedFiles: files.value.length,
}));

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
  const positions = nodePositions.value;
  const routes = routeArrows(data.edges, positions);
  arrowRoutes.value = routes.map((r, i) => ({
    edgeId: `edge-${i}`,
    waypoints: r.waypoints,
    fromFileId: r.edge.fromFileId,
    toFileId: r.edge.toFileId,
    type: r.edge.type,
    interfaceName: r.edge.interfaceName,
    paramName: r.edge.paramName,
    methodCalls: r.edge.methodCalls,
  }));
}
