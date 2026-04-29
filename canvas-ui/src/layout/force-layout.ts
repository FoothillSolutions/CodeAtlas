import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY, type Simulation, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';
import type { MrClassNode, MrClassEdge } from '../types';

export interface ForceNode extends SimulationNodeDatum {
  id: string;
  classNode: MrClassNode;
  radius: number;
  riskScore: number;
}

export interface ForceLink extends SimulationLinkDatum<ForceNode> {
  edge: MrClassEdge;
}

export type ForceSimulation = Simulation<ForceNode, ForceLink>;

import type { ForceConfig } from '../state/graph-store';

export function createForceSimulation(
  classNodes: MrClassNode[],
  classEdges: MrClassEdge[],
  riskScores: Map<string, number>,
  width: number,
  height: number,
  cfg?: ForceConfig,
): { simulation: ForceSimulation; nodes: ForceNode[]; links: ForceLink[] } {
  const maxRisk = Math.max(1, ...Array.from(riskScores.values()));

  const nodes: ForceNode[] = classNodes.map(cn => {
    const fileRisk = riskScores.get(cn.fileId) ?? 0;
    const normalized = fileRisk / maxRisk;
    const radius = 8 + normalized * 32;
    return {
      id: cn.id,
      classNode: cn,
      radius,
      riskScore: fileRisk,
    };
  });

  const nodeIds = new Set(nodes.map(n => n.id));
  const links: ForceLink[] = classEdges
    .filter(e => nodeIds.has(e.fromClassId) && nodeIds.has(e.toClassId))
    .map(e => ({
      source: e.fromClassId,
      target: e.toClassId,
      edge: e,
    }));

  const charge = cfg?.chargeStrength ?? -150;
  const linkDist = cfg?.linkDistance ?? 120;
  const gravity = cfg?.gravityStrength ?? 0.15;
  const collPad = cfg?.collisionPadding ?? 4;

  const simulation = forceSimulation<ForceNode>(nodes)
    .force('charge', forceManyBody<ForceNode>().strength(charge).distanceMax(400))
    .force('link', forceLink<ForceNode, ForceLink>(links).id(d => d.id).distance(linkDist))
    .force('center', forceCenter(width / 2, height / 2))
    .force('x', forceX<ForceNode>(width / 2).strength(gravity))
    .force('y', forceY<ForceNode>(height / 2).strength(gravity))
    .force('collision', forceCollide<ForceNode>().radius(d => d.radius + collPad))
    .alphaDecay(0.02)
    .velocityDecay(0.4);

  return { simulation, nodes, links };
}
