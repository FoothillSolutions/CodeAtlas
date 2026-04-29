import { computed } from '@preact/signals';
import { files, edges } from './graph-store';
import { colors } from '../theme/tokens';

export const riskScores = computed(() => {
  const fileList = files.value;
  const edgeList = edges.value;

  const fanOut = new Map<string, number>();
  const fanIn = new Map<string, number>();

  for (const edge of edgeList) {
    fanOut.set(edge.fromFileId, (fanOut.get(edge.fromFileId) ?? 0) + 1);
    fanIn.set(edge.toFileId, (fanIn.get(edge.toFileId) ?? 0) + 1);
  }

  const scores = new Map<string, number>();
  for (const file of fileList) {
    const churn = file.additions + file.deletions;
    const fo = fanOut.get(file.id) ?? 0;
    const fi = fanIn.get(file.id) ?? 0;
    const newMultiplier = file.isNew ? 2 : 1;
    scores.set(file.id, churn * (fo + fi + 1) * newMultiplier);
  }
  return scores;
});

const riskTiers = computed(() => {
  const scores = riskScores.value;
  const vals = Array.from(scores.values()).sort((a, b) => a - b);
  const n = vals.length;
  if (n === 0) return new Map<string, 'critical' | 'high' | 'medium' | 'low'>();

  const p50 = vals[Math.floor(n * 0.5)];
  const p75 = vals[Math.floor(n * 0.75)];
  const p90 = vals[Math.floor(n * 0.9)];

  const tiers = new Map<string, 'critical' | 'high' | 'medium' | 'low'>();
  for (const [id, score] of scores) {
    if (score >= p90) tiers.set(id, 'critical');
    else if (score >= p75) tiers.set(id, 'high');
    else if (score >= p50) tiers.set(id, 'medium');
    else tiers.set(id, 'low');
  }
  return tiers;
});

export function getRiskColor(fileId: string): string | null {
  const tier = riskTiers.value.get(fileId);
  switch (tier) {
    case 'critical': return colors.risk.criticalFill;
    case 'high':     return colors.risk.highFill;
    case 'medium':   return colors.risk.mediumFill;
    default:         return null;
  }
}

export function getRiskBorderColor(fileId: string): string | null {
  const tier = riskTiers.value.get(fileId);
  switch (tier) {
    case 'critical': return colors.risk.criticalBorder;
    case 'high':     return colors.risk.highBorder;
    case 'medium':   return colors.risk.mediumBorder;
    default:         return null;
  }
}

export function getRiskLabel(fileId: string): string | null {
  const score = riskScores.value.get(fileId) ?? 0;
  const tier = riskTiers.value.get(fileId);
  if (!tier || tier === 'low' || score === 0) return null;
  const total = Math.max(...Array.from(riskScores.value.values()));
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  return `Risk: ${pct}%`;
}
