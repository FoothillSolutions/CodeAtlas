import type { NodePosition } from '../layout/dagre-layout';
import type { ArchProjectNode } from '../layout/arch-layout';
import { colors, dimensions, fonts, fontStrings } from '../theme/tokens';

const BORDER_RADIUS = 12;
const HEADER_HEIGHT = 40;

export function paintProjectNode(
  ctx: CanvasRenderingContext2D,
  projNode: ArchProjectNode,
  pos: NodePosition,
  options: {
    isExpanded: boolean;
    isHovered: boolean;
  },
) {
  const { x, y, width, height } = pos;

  ctx.save();

  if (options.isHovered) {
    ctx.shadowColor = colors.selection.hoverGlow;
    ctx.shadowBlur = 16;
  }

  ctx.beginPath();
  roundRect(ctx, x, y, width, height, BORDER_RADIUS);
  ctx.fillStyle = colors.arch.nodeFill;
  ctx.fill();

  const strokeColor = options.isExpanded ? colors.arch.expandedStroke : colors.arch.nodeStroke;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = options.isExpanded ? 2.5 : 2;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.beginPath();
  roundRectTop(ctx, x, y, width, HEADER_HEIGHT, BORDER_RADIUS);
  ctx.fillStyle = colors.arch.nodeHeaderFill;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y + HEADER_HEIGHT);
  ctx.lineTo(x + width, y + HEADER_HEIGHT);
  ctx.strokeStyle = colors.border.default;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = fontStrings.ui14bold;
  ctx.fillStyle = colors.text.primary;
  ctx.textBaseline = 'middle';
  const nameMaxW = width - 48;
  const name = truncateText(ctx, projNode.projectName, nameMaxW);
  ctx.fillText(name, x + 12, y + HEADER_HEIGHT / 2);

  const chevronX = x + width - 26;
  const chevronY = y + HEADER_HEIGHT / 2;
  const chevronSize = 6;
  ctx.strokeStyle = colors.text.tertiary;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (options.isExpanded) {
    ctx.moveTo(chevronX - chevronSize, chevronY + chevronSize / 2);
    ctx.lineTo(chevronX, chevronY - chevronSize / 2);
    ctx.lineTo(chevronX + chevronSize, chevronY + chevronSize / 2);
  } else {
    ctx.moveTo(chevronX - chevronSize, chevronY - chevronSize / 2);
    ctx.lineTo(chevronX, chevronY + chevronSize / 2);
    ctx.lineTo(chevronX + chevronSize, chevronY - chevronSize / 2);
  }
  ctx.stroke();

  if (!options.isExpanded) {
    const statsY = y + HEADER_HEIGHT + 16;
    ctx.font = fontStrings.ui12;
    ctx.fillStyle = colors.text.secondary;
    ctx.fillText(`${projNode.totalCount} files`, x + 12, statsY);

    if (projNode.changedCount > 0) {
      const fileTextW = ctx.measureText(`${projNode.totalCount} files  `).width;
      ctx.fillStyle = colors.arch.statsAdd;
      ctx.fillText(`+${projNode.changedCount} changed`, x + 12 + fileTextW, statsY);
    }

    const barY = statsY + 18;
    const barW = width - 24;
    const barH = 4;
    ctx.fillStyle = colors.border.default;
    roundRect(ctx, x + 12, barY, barW, barH, 2);
    ctx.fill();

    if (projNode.changedCount > 0) {
      const ratio = projNode.changedCount / projNode.totalCount;
      ctx.fillStyle = colors.arch.statsAdd;
      roundRect(ctx, x + 12, barY, barW * ratio, barH, 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

export function paintArchEdge(
  ctx: CanvasRenderingContext2D,
  fromPos: NodePosition,
  toPos: NodePosition,
  interfaceName: string,
  parallelIndex: number,
  parallelTotal: number,
) {
  const fromCx = fromPos.x + fromPos.width / 2;
  const fromCy = fromPos.y + fromPos.height / 2;
  const toCx = toPos.x + toPos.width / 2;
  const toCy = toPos.y + toPos.height / 2;

  const spread = 18;
  const offset = parallelTotal > 1
    ? (parallelIndex - (parallelTotal - 1) / 2) * spread
    : 0;

  const fromPort = getEdgePort(fromPos, toCx, toCy + offset);
  const toPort = getEdgePort(toPos, fromCx, fromCy + offset);

  const fp = { x: fromPort.x, y: fromPort.y + offset };
  const tp = { x: toPort.x, y: toPort.y + offset };

  ctx.save();
  ctx.strokeStyle = colors.arch.edgeStroke;
  ctx.globalAlpha = colors.arch.edgeAlpha;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(fp.x, fp.y);
  const dx = tp.x - fp.x;
  ctx.bezierCurveTo(fp.x + dx * 0.4, fp.y, tp.x - dx * 0.4, tp.y, tp.x, tp.y);
  ctx.stroke();

  drawArrowhead(ctx, tp.x, tp.y, Math.atan2(tp.y - fp.y, tp.x - fp.x));

  if (interfaceName) {
    const midX = (fp.x + tp.x) / 2;
    const midY = (fp.y + tp.y) / 2 - 6;
    ctx.globalAlpha = 0.85;
    ctx.font = `10px ${fonts.ui}`;
    const labelW = ctx.measureText(interfaceName).width + 8;
    ctx.fillStyle = colors.bg.secondary;
    ctx.fillRect(midX - labelW / 2, midY - 8, labelW, 14);
    ctx.fillStyle = colors.tooltip.interfaceName;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(interfaceName, midX, midY);
  }

  ctx.restore();
}

function getEdgePort(pos: NodePosition, targetX: number, targetY: number): { x: number; y: number } {
  const cx = pos.x + pos.width / 2;
  const cy = pos.y + pos.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;

  if (Math.abs(dx) * pos.height > Math.abs(dy) * pos.width) {
    const side = dx > 0 ? pos.x + pos.width : pos.x;
    const t = (side - cx) / dx;
    return { x: side, y: cy + dy * t };
  } else {
    const side = dy > 0 ? pos.y + pos.height : pos.y;
    const t = (side - cy) / dy;
    return { x: cx + dx * t, y: side };
  }
}

function drawArrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  const size = dimensions.arrowHeadSize;
  ctx.save();
  ctx.fillStyle = colors.arch.edgeStroke;
  ctx.globalAlpha = ctx.globalAlpha;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function paintFolderLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  width: number,
) {
  ctx.save();
  ctx.font = fontStrings.ui10;
  ctx.fillStyle = colors.text.muted;
  ctx.textBaseline = 'middle';
  const displayLabel = truncateText(ctx, label, width - 24);
  ctx.fillText(displayLabel, x + 12, y + 9);

  ctx.beginPath();
  const textW = ctx.measureText(displayLabel).width;
  const lineX = x + 12 + textW + 8;
  if (lineX < x + width - 12) {
    ctx.moveTo(lineX, y + 9);
    ctx.lineTo(x + width - 12, y + 9);
    ctx.strokeStyle = colors.border.subtle;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

export function paintFileSubNode(
  ctx: CanvasRenderingContext2D,
  fileName: string,
  isChanged: boolean,
  pos: NodePosition,
  isHovered: boolean,
) {
  const { x, y, width, height } = pos;

  ctx.save();

  if (isHovered) {
    ctx.shadowColor = colors.selection.hoverGlow;
    ctx.shadowBlur = 8;
  }

  ctx.beginPath();
  roundRect(ctx, x, y, width, height, 6);
  ctx.fillStyle = colors.bg.secondary;
  ctx.fill();

  const borderColor = isChanged ? colors.node.changed : colors.node.ghost;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.font = fontStrings.ui11;
  ctx.fillStyle = colors.text.secondary;
  ctx.textBaseline = 'middle';
  const displayName = truncateText(ctx, fileName, width - 16);
  ctx.fillText(displayName, x + 8, y + height / 2);

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundRectTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(text.slice(0, end) + '...').width > maxWidth) {
    end--;
  }
  return text.slice(0, end) + '...';
}
