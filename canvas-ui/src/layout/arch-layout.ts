import dagre from '@dagrejs/dagre';
import type { MrGraph, MrFileNode } from '../types';
import type { NodePosition } from './dagre-layout';

export interface ArchProjectNode {
  projectName: string;
  files: MrFileNode[];
  changedCount: number;
  totalCount: number;
}

export interface ArchEdge {
  fromProject: string;
  toProject: string;
  interfaceName: string;
  edgeType: string;
  parallelIndex: number;
  parallelTotal: number;
}

export interface FolderGroup {
  folderPath: string;
  files: MrFileNode[];
}

export interface ArchLayoutResult {
  projectPositions: Map<string, NodePosition>;
  projectNodes: Map<string, ArchProjectNode>;
  projectEdges: ArchEdge[];
  subNodePositions: Map<string, NodePosition>;
  folderGroupsByProject: Map<string, FolderGroup[]>;
}

const MIN_WIDTH = 180;
const MIN_HEIGHT = 80;
const FILE_SUB_NODE_HEIGHT = 32;
const SUB_NODE_PADDING = 12;
const EXPANDED_HEADER = 52;
const FOLDER_LABEL_HEIGHT = 18;
const FOLDER_LABEL_GAP = 4;
const FOLDER_GROUP_GAP = 8;
const MAX_COLS = 3;
const CHIP_H_PADDING = 24;
const CHIP_MIN_WIDTH = 120;
const AVG_CHAR_WIDTH = 7;

function chipWidth(fileName: string): number {
  return Math.max(CHIP_MIN_WIDTH, fileName.length * AVG_CHAR_WIDTH + CHIP_H_PADDING);
}

function computeProjectNodeSize(fileCount: number): { width: number; height: number } {
  const width = Math.max(MIN_WIDTH, 140 + fileCount * 8);
  const height = Math.max(MIN_HEIGHT, 60 + fileCount * 4);
  return { width: Math.min(width, 320), height: Math.min(height, 200) };
}

function computeExpandedSizeFromGroups(groups: FolderGroup[]): { width: number; height: number } {
  let maxRowWidth = 0;
  let height = EXPANDED_HEADER;

  for (let i = 0; i < groups.length; i++) {
    if (i > 0) height += FOLDER_GROUP_GAP;
    height += FOLDER_LABEL_HEIGHT + FOLDER_LABEL_GAP;
    const files = groups[i].files;
    const rows = Math.ceil(files.length / MAX_COLS);
    height += rows * (FILE_SUB_NODE_HEIGHT + SUB_NODE_PADDING);

    for (let row = 0; row < rows; row++) {
      const rowFiles = files.slice(row * MAX_COLS, (row + 1) * MAX_COLS);
      const rowWidth = rowFiles.reduce((sum, f) => sum + chipWidth(f.fileName) + SUB_NODE_PADDING, SUB_NODE_PADDING);
      if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
    }
  }
  height += SUB_NODE_PADDING;

  const width = Math.max(MIN_WIDTH, maxRowWidth);
  return { width, height };
}

function extractFolderPath(filePath: string, projectName: string): string {
  const segments = filePath.replace(/\\/g, '/').split('/');
  const normalizedProject = projectName.replace(/\(.*\)$/, '').trim();
  const projIdx = segments.findIndex(s => s === normalizedProject);
  if (projIdx < 0) return '/';
  const afterProj = segments.slice(projIdx + 1);
  if (afterProj.length <= 1) return '/';
  const folderParts = afterProj.slice(0, Math.min(2, afterProj.length - 1));
  return folderParts.length > 0 ? folderParts.join('/') : '/';
}

function buildFolderGroups(files: MrFileNode[], projectName: string): FolderGroup[] {
  const map = new Map<string, MrFileNode[]>();
  for (const file of files) {
    const folder = extractFolderPath(file.filePath, projectName);
    if (!map.has(folder)) map.set(folder, []);
    map.get(folder)!.push(file);
  }
  const groups: FolderGroup[] = [];
  for (const [folderPath, folderFiles] of map) {
    groups.push({ folderPath, files: folderFiles });
  }
  groups.sort((a, b) => a.folderPath.localeCompare(b.folderPath));
  return groups;
}

export function computeArchLayout(
  graph: MrGraph,
  expandedProjects: Set<string>,
): ArchLayoutResult {
  const projectPositions = new Map<string, NodePosition>();
  const projectNodes = new Map<string, ArchProjectNode>();
  const subNodePositions = new Map<string, NodePosition>();
  const folderGroupsByProject = new Map<string, FolderGroup[]>();

  if (graph.files.length === 0) {
    return { projectPositions, projectNodes, projectEdges: [], subNodePositions, folderGroupsByProject };
  }

  const filesByProject = new Map<string, MrFileNode[]>();
  const fileToProject = new Map<string, string>();

  for (const file of graph.files) {
    const proj = file.projectName || 'Other';
    if (!filesByProject.has(proj)) filesByProject.set(proj, []);
    filesByProject.get(proj)!.push(file);
    fileToProject.set(file.id, proj);
  }

  for (const [projName, files] of filesByProject) {
    const changedCount = files.filter(f => f.isChanged).length;
    projectNodes.set(projName, {
      projectName: projName,
      files,
      changedCount,
      totalCount: files.length,
    });
  }

  const edgeSet = new Map<string, { fromProject: string; toProject: string; interfaceName: string; edgeType: string }>();
  for (const edge of graph.edges) {
    const fromProj = fileToProject.get(edge.fromFileId);
    const toProj = fileToProject.get(edge.toFileId);
    if (!fromProj || !toProj || fromProj === toProj) continue;
    const key = `${fromProj}->${toProj}::${edge.interfaceName}`;
    if (!edgeSet.has(key)) {
      edgeSet.set(key, { fromProject: fromProj, toProject: toProj, interfaceName: edge.interfaceName, edgeType: edge.type });
    }
  }

  const pairGroups = new Map<string, Array<{ fromProject: string; toProject: string; interfaceName: string; edgeType: string }>>();
  for (const e of edgeSet.values()) {
    const pairKey = `${e.fromProject}->${e.toProject}`;
    if (!pairGroups.has(pairKey)) pairGroups.set(pairKey, []);
    pairGroups.get(pairKey)!.push(e);
  }

  const projectEdges: ArchEdge[] = [];
  for (const group of pairGroups.values()) {
    group.forEach((e, i) => {
      projectEdges.push({ ...e, parallelIndex: i, parallelTotal: group.length });
    });
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 80,
    ranksep: 160,
    marginx: 60,
    marginy: 60,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const [projName, projNode] of projectNodes) {
    const isExpanded = expandedProjects.has(projName);
    let size: { width: number; height: number };
    if (isExpanded) {
      const groups = buildFolderGroups(projNode.files, projName);
      folderGroupsByProject.set(projName, groups);
      size = computeExpandedSizeFromGroups(groups);
    } else {
      size = computeProjectNodeSize(projNode.totalCount);
    }
    g.setNode(projName, { width: size.width, height: size.height });
  }

  const dagreEdgePairs = new Set<string>();
  for (const edge of projectEdges) {
    const key = `${edge.fromProject}->${edge.toProject}`;
    if (!dagreEdgePairs.has(key)) {
      dagreEdgePairs.add(key);
      g.setEdge(edge.fromProject, edge.toProject);
    }
  }

  dagre.layout(g);

  for (const projName of g.nodes()) {
    const node = g.node(projName);
    if (!node) continue;
    projectPositions.set(projName, {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      width: node.width,
      height: node.height,
    });
  }

  for (const projName of expandedProjects) {
    const projPos = projectPositions.get(projName);
    const groups = folderGroupsByProject.get(projName);
    if (!projPos || !groups) continue;

    let curY = projPos.y + EXPANDED_HEADER;
    for (let gi = 0; gi < groups.length; gi++) {
      if (gi > 0) curY += FOLDER_GROUP_GAP;
      curY += FOLDER_LABEL_HEIGHT + FOLDER_LABEL_GAP;
      const group = groups[gi];
      const rows = Math.ceil(group.files.length / MAX_COLS);
      for (let row = 0; row < rows; row++) {
        let curX = projPos.x + SUB_NODE_PADDING;
        const rowFiles = group.files.slice(row * MAX_COLS, (row + 1) * MAX_COLS);
        for (const file of rowFiles) {
          const w = chipWidth(file.fileName);
          subNodePositions.set(file.id, {
            x: curX,
            y: curY + row * (FILE_SUB_NODE_HEIGHT + SUB_NODE_PADDING),
            width: w,
            height: FILE_SUB_NODE_HEIGHT,
          });
          curX += w + SUB_NODE_PADDING;
        }
      }
      curY += rows * (FILE_SUB_NODE_HEIGHT + SUB_NODE_PADDING);
    }
  }

  return { projectPositions, projectNodes, projectEdges, subNodePositions, folderGroupsByProject };
}
