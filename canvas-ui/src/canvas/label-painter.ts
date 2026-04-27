import { nodePositions, arrowRoutes, files } from '../state/graph-store';
import type { NodePosition } from '../layout/dagre-layout';
import type { MrFileNode } from '../types';
import { zoom, panX, panY, selectedNodeId, hoveredNodeId } from '../state/ui-store';
import { colors, fonts } from '../theme/tokens';
import { roundRect } from './node-painter';

export interface LabelCandidate {
  screenX: number;
  screenY: number;
  text: string;
  width: number;
  height: number;
  priority: number;
  alpha: number;
}

const LABEL_FONT_SIZE = 11;
const LABEL_PADDING_H = 4;
const LABEL_PADDING_V = 2;
const LABEL_BACKDROP_RADIUS = 3;

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

export function getLabelPriority(
  file: MrFileNode,
  selected: string | null,
  hovered: string | null,
  connectedIds: Set<string> | null,
): number {
  if (file.id === selected || file.id === hovered) return 100;
  if (connectedIds?.has(file.id)) return 80;
  if (file.isNew) return 60;
  if (file.isChanged) return 40 + Math.min(20, (file.additions + file.deletions) / 10);
  return 10;
}

export function paintLabels(
  ctx: CanvasRenderingContext2D,
  allFiles: MrFileNode[],
  positions: Map<string, NodePosition>,
  currentZoom: number,
  currentPanX: number,
  currentPanY: number,
  devicePixelRatio: number,
  selected: string | null,
  hovered: string | null,
  connectedIds: Set<string> | null,
  viewportX: number,
  viewportY: number,
  viewportW: number,
  viewportH: number,
) {
  ctx.save();
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const font = `${LABEL_FONT_SIZE}px ${fonts.ui}`;
  ctx.font = font;

  const candidates: LabelCandidate[] = [];

  for (const file of allFiles) {
    const pos = positions.get(file.id);
    if (!pos) continue;

    if (pos.x + pos.width < viewportX || pos.x > viewportX + viewportW ||
        pos.y + pos.height < viewportY || pos.y > viewportY + viewportH) {
      continue;
    }

    const worldCx = pos.x + pos.width / 2;
    const worldTopY = pos.y;

    const screenX = worldCx * currentZoom + currentPanX;
    const screenY = worldTopY * currentZoom + currentPanY - 8;

    const baseName = file.fileName.replace(/\.[^.]+$/, '');
    const textWidth = ctx.measureText(baseName).width;

    candidates.push({
      screenX: screenX - textWidth / 2 - LABEL_PADDING_H,
      screenY: screenY - LABEL_FONT_SIZE - LABEL_PADDING_V,
      text: baseName,
      width: textWidth + LABEL_PADDING_H * 2,
      height: LABEL_FONT_SIZE + LABEL_PADDING_V * 2,
      priority: getLabelPriority(file, selected, hovered, connectedIds),
      alpha: 1,
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);

  const COLLISION_MARGIN = 6;
  const placed: LabelCandidate[] = [];
  for (const c of candidates) {
    let collides = false;
    for (const p of placed) {
      if (c.screenX - COLLISION_MARGIN < p.screenX + p.width + COLLISION_MARGIN &&
          c.screenX + c.width + COLLISION_MARGIN > p.screenX - COLLISION_MARGIN &&
          c.screenY - COLLISION_MARGIN < p.screenY + p.height + COLLISION_MARGIN &&
          c.screenY + c.height + COLLISION_MARGIN > p.screenY - COLLISION_MARGIN) {
        collides = true;
        break;
      }
    }
    if (collides) continue;
    placed.push(c);
  }

  for (const label of placed) {
    ctx.globalAlpha = label.priority >= 80 ? 0.95 : label.priority >= 40 ? 0.8 : 0.6;

    ctx.fillStyle = colors.bg.overlay;
    roundRect(ctx, label.screenX, label.screenY, label.width, label.height, LABEL_BACKDROP_RADIUS);
    ctx.fill();

    ctx.fillStyle = colors.text.secondary;
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label.text, label.screenX + LABEL_PADDING_H, label.screenY + LABEL_PADDING_V);
  }

  ctx.restore();
}

export function paintDiffLabels(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, devicePixelRatio: number) {
  const positions = nodePositions.value;
  const allFiles = files.value;
  const currentZoom = zoom.value;
  const currentPanX = panX.value;
  const currentPanY = panY.value;
  const selected = selectedNodeId.value;
  const hovered = hoveredNodeId.value;

  const viewportX = -currentPanX / currentZoom;
  const viewportY = -currentPanY / currentZoom;
  const viewportW = (canvasWidth / devicePixelRatio) / currentZoom;
  const viewportH = (canvasHeight / devicePixelRatio) / currentZoom;

  let connectedIds: Set<string> | null = null;
  if (selected) {
    connectedIds = computeConnectedIds(selected, arrowRoutes.value);
  }

  paintLabels(ctx, allFiles, positions, currentZoom, currentPanX, currentPanY, devicePixelRatio,
    selected, hovered, connectedIds, viewportX, viewportY, viewportW, viewportH);
}
