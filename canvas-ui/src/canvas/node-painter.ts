import type { MrFileNode } from '../types';
import type { NodePosition } from '../layout/dagre-layout';
import type { ReviewStatus } from '../state/review-store';

const COLORS = {
  // Background
  boxBg: '#161b22',
  headerBg: '#1c2128',
  border: '#30363d',

  // Node type borders
  changedBorder: '#58a6ff',
  newBorder: '#3fb950',
  ghostBorder: '#30363d',

  // Text
  textPrimary: '#f0f6fc',
  textSecondary: '#8b949e',
  textMuted: '#484f58',

  // Diff
  addLine: 'rgba(46, 160, 67, 0.15)',
  removeLine: 'rgba(248, 81, 73, 0.15)',
  addText: '#3fb950',
  removeText: '#f85149',

  // Review status dots
  reviewed: '#3fb950',
  flagged: '#f85149',
  'needs-attention': '#d29922',

  // Selection
  selectedGlow: 'rgba(56, 132, 244, 0.3)',
  hoverGlow: 'rgba(56, 132, 244, 0.15)',
};

const HEADER_HEIGHT = 36;
const LINE_HEIGHT = 16;
const FONT_MONO = '11px "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace';
const FONT_UI = '12px "Segoe UI", system-ui, sans-serif';
const FONT_UI_BOLD = 'bold 12px "Segoe UI", system-ui, sans-serif';
const MAX_PREVIEW_LINES = 8;
const BORDER_RADIUS = 8;
const PADDING = 8;

export function paintNode(
  ctx: CanvasRenderingContext2D,
  file: MrFileNode,
  pos: NodePosition,
  options: {
    isSelected: boolean;
    isHovered: boolean;
    isDimmed: boolean;
    reviewStatus: ReviewStatus;
  }
) {
  const { x, y, width, height } = pos;
  const { isSelected, isHovered, isDimmed, reviewStatus } = options;

  ctx.save();

  if (isDimmed) {
    ctx.globalAlpha = 0.2;
  }

  // Selection glow
  if (isSelected) {
    ctx.shadowColor = COLORS.selectedGlow;
    ctx.shadowBlur = 16;
  } else if (isHovered) {
    ctx.shadowColor = COLORS.hoverGlow;
    ctx.shadowBlur = 12;
  }

  // Box background
  roundRect(ctx, x, y, width, height, BORDER_RADIUS);
  ctx.fillStyle = COLORS.boxBg;
  ctx.fill();

  // Border
  const borderColor = file.isNew ? COLORS.newBorder
    : file.isChanged ? COLORS.changedBorder
    : COLORS.ghostBorder;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = file.isChanged || file.isNew ? 2 : 1;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Header background
  ctx.save();
  ctx.beginPath();
  // Clip to top part of rounded rect
  roundRectTop(ctx, x, y, width, HEADER_HEIGHT, BORDER_RADIUS);
  ctx.fillStyle = COLORS.headerBg;
  ctx.fill();
  // Header bottom border
  ctx.beginPath();
  ctx.moveTo(x, y + HEADER_HEIGHT);
  ctx.lineTo(x + width, y + HEADER_HEIGHT);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // File name
  ctx.font = FONT_UI_BOLD;
  ctx.fillStyle = COLORS.textPrimary;
  const maxNameWidth = width - 120;
  const displayName = truncateText(ctx, file.fileName, maxNameWidth);
  ctx.fillText(displayName, x + PADDING + 4, y + HEADER_HEIGHT / 2 + 4);

  // Diff stats in header
  if (file.isChanged && (file.additions > 0 || file.deletions > 0)) {
    const statsText = `+${file.additions} -${file.deletions}`;
    ctx.font = FONT_UI;
    const statsWidth = ctx.measureText(statsText).width;
    const statsX = x + width - statsWidth - PADDING - 4;

    // +additions
    ctx.fillStyle = COLORS.addText;
    ctx.fillText(`+${file.additions}`, statsX, y + HEADER_HEIGHT / 2 + 4);

    // -deletions
    const addWidth = ctx.measureText(`+${file.additions} `).width;
    ctx.fillStyle = COLORS.removeText;
    ctx.fillText(`-${file.deletions}`, statsX + addWidth, y + HEADER_HEIGHT / 2 + 4);
  }

  // NEW / unchanged badge
  if (file.isNew) {
    drawBadge(ctx, x + width - 50, y + 8, 'NEW', '#238636', '#fff');
  } else if (!file.isChanged) {
    drawBadge(ctx, x + width - 80, y + 8, 'unchanged', '#30363d', '#8b949e');
  }

  // Review status: colored left stripe + badge
  if (reviewStatus !== 'unreviewed') {
    const statusColor = COLORS[reviewStatus] || COLORS.textMuted;

    // Vertical stripe on the left edge (4px wide)
    ctx.save();
    ctx.beginPath();
    // Clip to rounded rect so stripe respects border radius
    roundRect(ctx, x, y, width, height, BORDER_RADIUS);
    ctx.clip();
    ctx.fillStyle = statusColor;
    ctx.fillRect(x, y, 4, height);
    ctx.restore();

    // Status badge near top-right (like the NEW badge)
    const label = reviewStatus === 'reviewed' ? 'REVIEWED'
      : reviewStatus === 'flagged' ? 'FLAGGED'
      : 'ATTENTION';
    const badgeBg = reviewStatus === 'reviewed' ? '#238636'
      : reviewStatus === 'flagged' ? '#9e1c23'
      : '#7a5a00';
    // Position badge to the left of diff stats area
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    const badgeTextWidth = ctx.measureText(label).width;
    const badgeX = x + width - badgeTextWidth - 16 - 70; // offset from right, leaving room for stats
    drawBadge(ctx, badgeX, y + 8, label, badgeBg, '#fff');
  }

  // Code preview (collapsed view — first N lines across all sections)
  ctx.font = FONT_MONO;
  let lineY = y + HEADER_HEIGHT + 12;
  let linesDrawn = 0;

  for (const section of file.sections) {
    if (linesDrawn >= MAX_PREVIEW_LINES) break;

    for (const line of section.lines) {
      if (linesDrawn >= MAX_PREVIEW_LINES) break;

      // Line background for diff
      if (line.diffType === 'add') {
        ctx.fillStyle = COLORS.addLine;
        ctx.fillRect(x + 1, lineY - LINE_HEIGHT + 4, width - 2, LINE_HEIGHT);
      } else if (line.diffType === 'remove') {
        ctx.fillStyle = COLORS.removeLine;
        ctx.fillRect(x + 1, lineY - LINE_HEIGHT + 4, width - 2, LINE_HEIGHT);
      }

      // Line number
      if (line.lineNum > 0) {
        ctx.fillStyle = COLORS.textMuted;
        const numText = String(line.lineNum);
        const numWidth = ctx.measureText(numText).width;
        ctx.fillText(numText, x + 32 - numWidth, lineY);
      }

      // Code text (plain, no syntax highlighting in canvas view)
      ctx.fillStyle = line.diffType === 'add' ? COLORS.addText
        : line.diffType === 'remove' ? COLORS.removeText
        : COLORS.textSecondary;
      const codeText = truncateText(ctx, line.text, width - 48);
      ctx.fillText(codeText, x + 40, lineY);

      lineY += LINE_HEIGHT;
      linesDrawn++;
    }
  }

  // "... N more lines" indicator
  const totalLines = file.sections.reduce((sum, s) => sum + s.lines.length, 0);
  if (totalLines > MAX_PREVIEW_LINES) {
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`... ${totalLines - MAX_PREVIEW_LINES} more lines`, x + 40, lineY + 4);
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
  ctx.font = '10px "Segoe UI", system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const pw = 8, ph = 4;

  // Badge background
  roundRect(ctx, x, y, tw + pw * 2, 18, 9);
  ctx.fillStyle = bg;
  ctx.fill();

  // Badge text
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

export function paintCompactNode(
  ctx: CanvasRenderingContext2D,
  file: MrFileNode,
  pos: NodePosition,
  currentZoom: number,
  options: {
    isSelected: boolean;
    isHovered: boolean;
    isDimmed: boolean;
    reviewStatus: ReviewStatus;
  }
) {
  const { x, y, width, height } = pos;
  const { isSelected, isHovered, isDimmed, reviewStatus } = options;

  ctx.save();

  if (isDimmed) {
    ctx.globalAlpha = 0.2;
  }

  if (isSelected) {
    ctx.shadowColor = COLORS.selectedGlow;
    ctx.shadowBlur = 16;
  } else if (isHovered) {
    ctx.shadowColor = COLORS.hoverGlow;
    ctx.shadowBlur = 12;
  }

  roundRect(ctx, x, y, width, height, BORDER_RADIUS);
  ctx.fillStyle = COLORS.boxBg;
  ctx.fill();

  const borderColor = file.isNew ? COLORS.newBorder
    : file.isChanged ? COLORS.changedBorder
    : COLORS.ghostBorder;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = file.isChanged || file.isNew ? 2 : 1;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Review status: colored left stripe (thick for visibility at overview zoom)
  if (reviewStatus !== 'unreviewed') {
    const statusColor = COLORS[reviewStatus] || COLORS.textMuted;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, width, height, BORDER_RADIUS);
    ctx.clip();
    ctx.fillStyle = statusColor;
    ctx.fillRect(x, y, 6, height);
    ctx.restore();
  }

  // Large centered class name — scale font inversely with zoom so it stays readable
  // Clamp between 24px (when zoomed in near threshold) and 64px (when very zoomed out)
  const rawFontSize = 18 / currentZoom;
  const fontSize = Math.max(24, Math.min(48, rawFontSize));
  ctx.font = `bold ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = COLORS.textPrimary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Strip extension for cleaner display (e.g. "UserService" instead of "UserService.cs")
  const baseName = file.fileName.replace(/\.[^.]+$/, '');
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // Truncate if needed at this font size
  const maxTextWidth = width - 40;
  const displayName = truncateText(ctx, baseName, maxTextWidth);
  ctx.fillText(displayName, centerX, centerY - (file.isChanged ? fontSize * 0.4 : 0));

  // Diff stats below name — also scaled up
  if (file.isChanged && (file.additions > 0 || file.deletions > 0)) {
    const statsFontSize = Math.max(16, fontSize * 0.55);
    ctx.font = `${statsFontSize}px "Segoe UI", system-ui, sans-serif`;
    const statsY = centerY + fontSize * 0.5;

    ctx.fillStyle = COLORS.addText;
    const addText = `+${file.additions}`;
    const addWidth = ctx.measureText(addText).width;
    ctx.fillText(addText, centerX - addWidth * 0.3, statsY);

    ctx.fillStyle = COLORS.removeText;
    ctx.fillText(`-${file.deletions}`, centerX + addWidth * 0.8, statsY);
  }

  // Type indicator badge — scaled so it's visible at overview zoom
  if (file.isNew) {
    const badgeFontSize = Math.max(14, fontSize * 0.4);
    ctx.font = `bold ${badgeFontSize}px "Segoe UI", system-ui, sans-serif`;
    const badgeW = ctx.measureText('NEW').width + 16;
    drawBadge(ctx, x + width - badgeW - 8, y + 8, 'NEW', '#238636', '#fff');
  }

  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

export { COLORS };
