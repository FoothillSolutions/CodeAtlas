import { files, glyphDataMap } from '../state/graph-store';
import { getEffectiveLodTier, lodFadeStates, type LodTier, type LodFadeState } from '../state/ui-store';
import type { MrFileNode } from '../types';
import type { NodePosition } from '../layout/dagre-layout';
import { paintNode, paintDotNode, paintGlyphNode } from './node-painter';

export const FADE_SPEED = 4;

export function updateLodFades(dt: number): boolean {
  const targetTier = getEffectiveLodTier();
  const allFiles = files.value;
  const states = lodFadeStates.value;
  let changed = false;
  let needsContinue = false;

  const next = new Map(states);

  for (const file of allFiles) {
    let state = next.get(file.id);

    if (!state) {
      next.set(file.id, { currentTier: targetTier, targetTier, t: 1 });
      changed = true;
      continue;
    }

    if (state.targetTier !== targetTier) {
      next.set(file.id, { currentTier: state.targetTier, targetTier, t: 0 });
      changed = true;
      needsContinue = true;
      continue;
    }

    if (state.t < 1) {
      const newT = Math.min(1, state.t + dt * FADE_SPEED);
      next.set(file.id, { ...state, t: newT });
      changed = true;
      if (newT < 1) needsContinue = true;
    }
  }

  if (changed) lodFadeStates.value = next;
  return needsContinue;
}

export function paintTier(
  ctx: CanvasRenderingContext2D,
  tier: LodTier,
  file: Parameters<typeof paintNode>[1],
  pos: Parameters<typeof paintNode>[2],
  currentZoom: number,
  options: Parameters<typeof paintNode>[3],
  overlayData: Parameters<typeof paintNode>[4],
  glyphs: Map<string, import('../state/graph-store').GlyphLine[]>,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha *= alpha;

  switch (tier) {
    case 'dot':
      paintDotNode(ctx, file, pos, options);
      break;
    case 'glyph':
      paintGlyphNode(ctx, file, pos, glyphs.get(file.id) ?? [], options, overlayData);
      break;
    case 'full':
      paintNode(ctx, file, pos, options, overlayData);
      break;
  }

  ctx.restore();
}
