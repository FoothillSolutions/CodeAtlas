export interface MrGraph {
  branchName: string;
  repoName: string;
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  files: MrFileNode[];
  edges: MrEdge[];
  config?: CanvasConfig;
  schemaVersion?: number;
}

export interface MrFileNode {
  id: string;
  fileName: string;
  filePath: string;
  additions: number;
  deletions: number;
  isNew: boolean;
  isChanged: boolean;
  fileType: string; // "csharp", "json", "yaml", "sql", "xml", "other"
  sections: MrCodeSection[];
  dependencies: MrDependency[];
  methodCalls: MrMethodCall[];
  projectName: string;
  namespace?: string | null;
  impactRadius?: number;
}

export interface MrCodeSection {
  header: string;
  lines: MrCodeLine[];
}

export interface MrCodeLine {
  lineNum: number;
  text: string;
  diffType: string; // "context" | "add" | "remove"
}

export interface MrDependency {
  interfaceName: string;
  paramName: string;
}

export interface MrMethodCall {
  fromMethod: string;
  targetInterface: string;
  calledMethod: string;
  isInChangedCode: boolean;
  callOrder?: number;
}

export interface MrEdge {
  fromFileId: string;
  toFileId: string;
  interfaceName: string;
  paramName?: string;
  type: string; // "di" | "calls" | "di-ghost"
  methodCalls: string[];
}

export interface CanvasConfig {
  defaultZoom?: number;
  nodeWidth?: number;
  rankDirection?: string;
  maxVisibleLines?: number;
}
