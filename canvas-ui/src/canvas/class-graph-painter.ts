import type { ForceNode, ForceLink } from '../layout/force-layout';
import { colors, dimensions, fontStrings } from '../theme/tokens';
import { getRiskBorderColor } from '../state/analysis-store';

const EDGE_COLORS = {
  di: colors.edge.di,
  calls: colors.edge.calls,
  'di-ghost': colors.edge.ghost,
  implements: colors.edge.di,
} as const;

function truncateLabel(text: string, ctx: CanvasRenderingContext2D, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  for (let i = text.length - 1; i > 0; i--) {
    const candidate = text.slice(0, i) + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) return candidate;
  }
  return ellipsis;
}

function getEdgeConfig(type: string) {
  return EDGE_COLORS[type as keyof typeof EDGE_COLORS] ?? EDGE_COLORS.di;
}

function getNodeBorderColor(node: ForceNode): string {
  if (!node.classNode.isChanged) return colors.node.ghost;
  if (node.classNode.isInterface) return colors.glyph.class;
  return colors.node.changed;
}

function getRiskBorderWidth(riskScore: number, maxRisk: number): number {
  if (maxRisk === 0) return 2;
  const t = riskScore / maxRisk;
  return 2 + t * 4;
}

export function paintGraphEdges(
  ctx: CanvasRenderingContext2D,
  links: ForceLink[],
  _maxRisk: number,
  highlightedIds: Set<string> | null,
) {
  for (const link of links) {
    const source = link.source as ForceNode;
    const target = link.target as ForceNode;
    if (source.x == null || target.x == null) continue;

    const isDimmed = highlightedIds !== null &&
      !highlightedIds.has(source.id) && !highlightedIds.has(target.id);

    const edgeType = link.edge.type;
    const colorConfig = getEdgeConfig(edgeType);

    ctx.save();
    if (isDimmed) ctx.globalAlpha = 0.1;

    ctx.strokeStyle = colorConfig.stroke;
    ctx.globalAlpha = isDimmed ? 0.1 : colorConfig.alpha;
    ctx.lineWidth = 1.5;

    if (edgeType === 'calls') {
      ctx.setLineDash([6, 3]);
    } else if (edgeType === 'di-ghost') {
      ctx.setLineDash([4, 4]);
    }

    ctx.beginPath();
    ctx.moveTo(source.x!, source.y!);
    ctx.lineTo(target.x!, target.y!);
    ctx.stroke();

    ctx.setLineDash([]);

    const dx = target.x! - source.x!;
    const dy = target.y! - source.y!;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const angle = Math.atan2(dy, dx);
      const tipX = target.x! - (dx / len) * target.radius;
      const tipY = target.y! - (dy / len) * target.radius;
      const size = dimensions.arrowHeadSize;

      ctx.fillStyle = colorConfig.stroke;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        tipX - size * Math.cos(angle - Math.PI / 6),
        tipY - size * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        tipX - size * Math.cos(angle + Math.PI / 6),
        tipY - size * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
    }

    if (link.edge.interfaceName && highlightedIds !== null && !isDimmed) {
      const midX = (source.x! + target.x!) / 2;
      const midY = (source.y! + target.y!) / 2;
      ctx.globalAlpha = 0.8;
      ctx.font = fontStrings.ui10;
      ctx.fillStyle = colors.edge.label;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(link.edge.interfaceName, midX, midY - 4);
    }

    ctx.restore();
  }
}

export function paintGraphNodes(
  ctx: CanvasRenderingContext2D,
  nodes: ForceNode[],
  maxRisk: number,
  selectedId: string | null,
  hoveredId: string | null,
  highlightedIds: Set<string> | null,
) {
  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;

    const isSelected = node.id === selectedId;
    const isHovered = node.id === hoveredId;
    const isDimmed = highlightedIds !== null && !highlightedIds.has(node.id);
    const isGhost = !node.classNode.isChanged;

    ctx.save();
    if (isDimmed) ctx.globalAlpha = 0.2;

    if (isSelected) {
      ctx.shadowColor = colors.selection.glow;
      ctx.shadowBlur = 16;
    } else if (isHovered) {
      ctx.shadowColor = colors.selection.hoverGlow;
      ctx.shadowBlur = 12;
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    const riskColor = getRiskBorderColor(node.classNode.fileId);
    ctx.fillStyle = isGhost
      ? colors.bg.tertiary
      : riskColor ?? colors.node.changed;
    ctx.fill();

    const borderColor = isSelected
      ? colors.selection.activeBorder
      : isGhost ? colors.node.ghost : (riskColor ?? colors.node.changed);
    const borderWidth = isSelected ? 3 : isGhost ? 1 : 2;

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    const showLabel = highlightedIds !== null && highlightedIds.has(node.id);
    if (showLabel) {
      ctx.font = fontStrings.ui11;
      ctx.fillStyle = isDimmed ? colors.text.muted : colors.text.primary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      ctx.fillText(node.classNode.className, node.x, node.y + node.radius + 6);
    }

    ctx.restore();
  }
}

export function hitTestGraphNode(
  worldX: number,
  worldY: number,
  nodes: ForceNode[],
): string | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.x == null || n.y == null) continue;
    const dx = worldX - n.x;
    const dy = worldY - n.y;
    if (dx * dx + dy * dy <= n.radius * n.radius) {
      return n.id;
    }
  }
  return null;
}
