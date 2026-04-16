import { signal, computed } from '@preact/signals';

// Canvas viewport state
export const zoom = signal(1);
export const panX = signal(0);
export const panY = signal(0);

// Semantic zoom: when enabled, nodes show compact class-name view at low zoom
export const semanticZoomEnabled = signal(true);

// Layout lock: when enabled, nodes cannot be dragged
export const layoutLocked = signal(true);

// Threshold: if zoom * LINE_HEIGHT < this, code text is illegible → show compact
const LEGIBILITY_PX = 6;
const NODE_LINE_HEIGHT = 16;

export function isCompactMode(): boolean {
  return semanticZoomEnabled.value && zoom.value * NODE_LINE_HEIGHT < LEGIBILITY_PX;
}

export function toggleSemanticZoom() {
  semanticZoomEnabled.value = !semanticZoomEnabled.value;
  markDirty();
}

// Selection state
export const selectedNodeId = signal<string | null>(null);
export const expandedNodeId = signal<string | null>(null);
export const hoveredNodeId = signal<string | null>(null);
export const hoveredEdgeIndex = signal<number | null>(null);

// Search / filter state
export const searchQuery = signal('');
export const searchVisible = signal(false);
export const activeFilters = signal<{
  fileTypes: Set<string>;
  minChanges: number;
  showOnlyWithEdges: boolean;
  reviewStatus: string | null; // null = all
}>({
  fileTypes: new Set(),
  minChanges: 0,
  showOnlyWithEdges: false,
  reviewStatus: null,
});

// Dirty flag for canvas re-rendering
export const canvasDirty = signal(true);

// Mark canvas as needing re-render
export function markDirty() {
  canvasDirty.value = true;
}

// Actions
export function selectNode(nodeId: string | null) {
  selectedNodeId.value = nodeId;
  markDirty();
}

export function expandNode(nodeId: string | null) {
  // Only one expanded at a time
  expandedNodeId.value = nodeId;
}

export function hoverNode(nodeId: string | null) {
  if (hoveredNodeId.value !== nodeId) {
    hoveredNodeId.value = nodeId;
    markDirty();
  }
}

export function hoverEdge(index: number | null) {
  if (hoveredEdgeIndex.value !== index) {
    hoveredEdgeIndex.value = index;
    markDirty();
  }
}

export function setZoom(newZoom: number) {
  zoom.value = Math.max(0.1, Math.min(3, newZoom));
  markDirty();
}

export function setPan(x: number, y: number) {
  panX.value = x;
  panY.value = y;
  markDirty();
}

export function toggleSearch() {
  searchVisible.value = !searchVisible.value;
  if (!searchVisible.value) {
    searchQuery.value = '';
  }
}

// Convert screen coordinates to canvas (world) coordinates
export function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: (screenX - panX.value) / zoom.value,
    y: (screenY - panY.value) / zoom.value,
  };
}

// Convert world coordinates to screen coordinates
export function worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: worldX * zoom.value + panX.value,
    y: worldY * zoom.value + panY.value,
  };
}
