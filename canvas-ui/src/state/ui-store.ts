import { signal } from '@preact/signals';
import { dimensions } from '../theme/tokens';

// View modes
export type ViewMode = 'diff' | 'arch';
export const viewMode = signal<ViewMode>('diff');

// Architecture view: which projects are expanded
export const expandedProjects = signal<Set<string>>(new Set());

export function toggleViewMode() {
  viewMode.value = viewMode.value === 'diff' ? 'arch' : 'diff';
  markDirty();
}

export function toggleProjectExpanded(projectName: string) {
  const next = new Set(expandedProjects.value);
  if (next.has(projectName)) next.delete(projectName);
  else next.add(projectName);
  expandedProjects.value = next;
  markDirty();
}

export function initExpandedProjects(projectNames: string[]) {
  expandedProjects.value = new Set(projectNames);
  markDirty();
}

// Overlay types
export type Overlay = 'risk-heatmap' | 'critical-paths';

// LOD tiers and pin modes
export type LodTier = 'dot' | 'glyph' | 'full';
export type LodPinMode = 'auto' | 'glyph' | 'full';

// Canvas viewport state
export const zoom = signal(1);
export const panX = signal(0);
export const panY = signal(0);

// LOD pin mode: 'auto' uses zoom thresholds, others force a tier
export const lodPinMode = signal<LodPinMode>('auto');

// Per-node LOD cross-fade state: nodeId → { currentTier, targetTier, t (0..1) }
export interface LodFadeState {
  currentTier: LodTier;
  targetTier: LodTier;
  t: number;
}
export const lodFadeStates = signal<Map<string, LodFadeState>>(new Map());

// Layout lock: when enabled, nodes cannot be dragged
export const layoutLocked = signal(true);

// Overlays
export const activeOverlays = signal<Set<Overlay>>(new Set());

// Threshold: if zoom * LINE_HEIGHT < this, code text is illegible → show compact
export function getAutoLodTier(): LodTier {
  const z = zoom.value;
  if (z < dimensions.lodDotThreshold) return 'dot';
  if (z < dimensions.lodGlyphThreshold) return 'glyph';
  return 'full';
}

export function getEffectiveLodTier(): LodTier {
  const pin = lodPinMode.value;
  if (pin === 'glyph') return 'glyph';
  if (pin === 'full') return 'full';
  return getAutoLodTier();
}

export function cycleLodPinMode() {
  const current = lodPinMode.value;
  if (current === 'auto') lodPinMode.value = 'glyph';
  else if (current === 'glyph') lodPinMode.value = 'full';
  else lodPinMode.value = 'auto';
  markDirty();
}

export function toggleOverlay(overlay: Overlay) {
  const next = new Set(activeOverlays.value);
  if (next.has(overlay)) next.delete(overlay);
  else next.add(overlay);
  activeOverlays.value = next;
  markDirty();
}

export function hasOverlay(overlay: Overlay): boolean {
  return activeOverlays.value.has(overlay);
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
