import type { MrFileNode } from '../types';
import type { NodePosition } from '../layout/dagre-layout';
import type { ReviewStatus } from '../state/review-store';
import type { GlyphLine } from '../state/graph-store';
import { colors, dimensions, fontStrings } from '../theme/tokens';

export interface OverlayData {
  riskFill: string | null;
  riskBorder: string | null;
  riskLabel: string | null;
  impactRadius: number;
}

const { headerHeight: HEADER_HEIGHT, borderRadius: BORDER_RADIUS, padding: PADDING } = dimensions;

function applyShadow(ctx: CanvasRenderingContext2D, isSelected: boolean, isHovered: boolean) {
  if (isSelected) {
    ctx.shadowColor = colors.selection.glow;
    ctx.shadowBlur = 16;
  } else if (isHovered) {
    ctx.shadowColor = colors.selection.hoverGlow;
    ctx.shadowBlur = 12;
  }
}

function paintHeader(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  ctx.save();
  ctx.beginPath();
  roundRectTop(ctx, x, y, width, HEADER_HEIGHT, BORDER_RADIUS);
  ctx.fillStyle = colors.bg.secondary;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y + HEADER_HEIGHT);
  ctx.lineTo(x + width, y + HEADER_HEIGHT);
  ctx.strokeStyle = colors.border.default;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export function paintNode(
  ctx: CanvasRenderingContext2D,
  file: MrFileNode,
  pos: NodePosition,
  options: {
    isSelected: boolean;
    isHovered: boolean;
    isDimmed: boolean;
    reviewStatus: ReviewStatus;
  },
  overlayData: OverlayData = { riskFill: null, riskBorder: null, riskLabel: null, impactRadius: 0 }
) {
  const { x, y, width, height } = pos;
  const { isSelected, isHovered, isDimmed, reviewStatus } = options;

  ctx.save();

  if (isDimmed) ctx.globalAlpha = 0.2;

  applyShadow(ctx, isSelected, isHovered);

  roundRect(ctx, x, y, width, height, BORDER_RADIUS);
  ctx.fillStyle = colors.bg.primary;
  ctx.fill();

  if (overlayData.riskFill) {
    ctx.fillStyle = overlayData.riskFill;
    ctx.fill();
  }

  const borderColor = overlayData.riskBorder ?? (file.isNew ? colors.node.new
    : file.isChanged ? colors.node.changed
    : colors.node.ghost);
  const baseWidth = file.isChanged || file.isNew ? 2 : 1;
  const borderWidth = baseWidth + Math.min(overlayData.impactRadius, 8);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  paintHeader(ctx, x, y, width);

  ctx.font = fontStrings.ui12bold;
  ctx.fillStyle = colors.text.primary;
  const maxNameWidth = width - 120;
  const displayName = truncateText(ctx, file.fileName, maxNameWidth);
  ctx.fillText(displayName, x + PADDING + 4, y + HEADER_HEIGHT / 2 + 4);

  if (file.isChanged && (file.additions > 0 || file.deletions > 0)) {
    const statsText = `+${file.additions} -${file.deletions}`;
    ctx.font = fontStrings.ui12;
    const statsWidth = ctx.measureText(statsText).width;
    const statsX = x + width - statsWidth - PADDING - 4;

    ctx.fillStyle = colors.diff.addText;
    ctx.fillText(`+${file.additions}`, statsX, y + HEADER_HEIGHT / 2 + 4);

    const addWidth = ctx.measureText(`+${file.additions} `).width;
    ctx.fillStyle = colors.diff.removeText;
    ctx.fillText(`-${file.deletions}`, statsX + addWidth, y + HEADER_HEIGHT / 2 + 4);
  }

  if (file.isNew) {
    drawBadge(ctx, x + width - 50, y + 8, 'NEW', colors.badge.newBg, colors.badge.newText);
  } else if (!file.isChanged) {
    drawBadge(ctx, x + width - 80, y + 8, 'unchanged', colors.badge.unchangedBg, colors.badge.unchangedText);
  }

  if (reviewStatus !== 'unreviewed') {
    const statusColor = colors.review[reviewStatus] || colors.text.muted;

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, width, height, BORDER_RADIUS);
    ctx.clip();
    ctx.fillStyle = statusColor;
    ctx.fillRect(x, y, 4, height);
    ctx.restore();

    const label = reviewStatus === 'reviewed' ? 'REVIEWED'
      : reviewStatus === 'flagged' ? 'FLAGGED'
      : 'ATTENTION';
    const badgeBg = reviewStatus === 'reviewed' ? colors.review.reviewedBg
      : reviewStatus === 'flagged' ? colors.review.riskBadgeBg
      : colors.review.attentionBg;
    ctx.font = fontStrings.ui10;
    const badgeTextWidth = ctx.measureText(label).width;
    const badgeX = x + width - badgeTextWidth - 16 - 70;
    drawBadge(ctx, badgeX, y + 8, label, badgeBg, '#fff');
  }

  if (overlayData.riskLabel) {
    ctx.font = fontStrings.ui10;
    const riskTextWidth = ctx.measureText(overlayData.riskLabel).width;
    const riskBadgeX = x + width - riskTextWidth - 16;
    const riskBadgeY = y + HEADER_HEIGHT - 20;
    drawBadge(ctx, riskBadgeX, riskBadgeY, overlayData.riskLabel, colors.review.riskBadgeBg, '#fff');
  }

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

function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg: string) {
  ctx.font = fontStrings.ui10;
  const tw = ctx.measureText(text).width;
  const pw = 8, ph = 4;

  roundRect(ctx, x, y, tw + pw * 2, 18, 9);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.fillStyle = fg;
  ctx.fillText(text, x + pw, y + 13);
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(text.slice(0, end) + '...').width > maxWidth) {
    end--;
  }
  return text.slice(0, end) + '...';
}


const GLYPH_COLORS: Record<string, string> = {
  import: colors.glyph.import,
  class: colors.glyph.class,
  method: colors.glyph.method,
  property: colors.glyph.property,
  comment: colors.glyph.comment,
  other: colors.glyph.other,
};

export function paintDotNode(
  ctx: CanvasRenderingContext2D,
  file: MrFileNode,
  pos: NodePosition,
  options: {
    isSelected: boolean;
    isHovered: boolean;
    isDimmed: boolean;
  },
) {
  const cx = pos.x + pos.width / 2;
  const cy = pos.y + pos.height / 2;
  const radius = Math.min(pos.width, pos.height) * 0.3;

  ctx.save();
  if (options.isDimmed) ctx.globalAlpha = 0.2;

  applyShadow(ctx, options.isSelected, options.isHovered);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = file.isNew ? colors.dot.new
    : file.isChanged ? colors.dot.changed
    : colors.dot.unchanged;
  ctx.fill();

  ctx.restore();
}

export function paintGlyphNode(
  ctx: CanvasRenderingContext2D,
  file: MrFileNode,
  pos: NodePosition,
  glyphs: GlyphLine[],
  options: {
    isSelected: boolean;
    isHovered: boolean;
    isDimmed: boolean;
    reviewStatus: ReviewStatus;
  },
  overlayData: OverlayData = { riskFill: null, riskBorder: null, riskLabel: null, impactRadius: 0 },
) {
  const { x, y, width, height } = pos;

  ctx.save();
  if (options.isDimmed) ctx.globalAlpha = 0.2;

  applyShadow(ctx, options.isSelected, options.isHovered);

  roundRect(ctx, x, y, width, height, BORDER_RADIUS);
  ctx.fillStyle = colors.bg.primary;
  ctx.fill();

  if (overlayData.riskFill) {
    ctx.fillStyle = overlayData.riskFill;
    ctx.fill();
  }

  const borderColor = overlayData.riskBorder ?? (file.isNew ? colors.node.new
    : file.isChanged ? colors.node.changed
    : colors.node.ghost);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = file.isChanged || file.isNew ? 2 : 1;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  const glyphAreaY = y + HEADER_HEIGHT + 4;
  const glyphAreaH = height - HEADER_HEIGHT - 8;
  const lineCount = glyphs.length;
  if (lineCount > 0) {
    const stripH = Math.max(1, Math.min(3, glyphAreaH / lineCount));
    const maxWidth = width - 16;

    for (let i = 0; i < lineCount && i * stripH < glyphAreaH; i++) {
      const gl = glyphs[i];
      const stripW = Math.max(4, Math.min(maxWidth, (gl.length / 80) * maxWidth));
      ctx.fillStyle = GLYPH_COLORS[gl.category] ?? GLYPH_COLORS.other;
      ctx.globalAlpha = (options.isDimmed ? 0.2 : 1) * (gl.diffType === 'add' || gl.diffType === 'remove' ? 0.9 : 0.5);
      ctx.fillRect(x + 8, glyphAreaY + i * stripH, stripW, Math.max(1, stripH - 0.5));
    }

    ctx.globalAlpha = options.isDimmed ? 0.1 : 0.25;
    for (let i = 0; i < lineCount && i * stripH < glyphAreaH; i++) {
      const gl = glyphs[i];
      if (gl.diffType === 'add' || gl.diffType === 'remove') {
        ctx.fillStyle = colors.glyph.diffOverlay;
        ctx.fillRect(x + 4, glyphAreaY + i * stripH, 3, Math.max(1, stripH - 0.5));
      }
    }
  }

  ctx.globalAlpha = options.isDimmed ? 0.2 : 1;
  paintHeader(ctx, x, y, width);

  ctx.font = fontStrings.ui12bold;
  ctx.fillStyle = colors.text.primary;
  const baseName = file.fileName.replace(/\.[^.]+$/, '');
  const displayName = truncateText(ctx, baseName, width - 16);
  ctx.fillText(displayName, x + PADDING + 4, y + HEADER_HEIGHT / 2 + 4);

  ctx.restore();
}

export { roundRect, truncateText };
