import type { MrGraph, MrFileNode } from '../types';

export function buildSystemPrompt(graph: MrGraph | null): string {
  if (!graph) return 'You are a code review assistant. No graph data is currently loaded.';

  const skeleton = {
    branchName: graph.branchName,
    repoName: graph.repoName,
    totalFiles: graph.totalFiles,
    totalAdditions: graph.totalAdditions,
    totalDeletions: graph.totalDeletions,
    files: graph.files.map(stripFileSections),
    edges: graph.edges,
  };

  return [
    'You are an expert C# code reviewer assisting with a merge request.',
    'You have full structural knowledge of every changed file (paths, dependencies, method calls, line counts) and the dependency graph between them.',
    'You DO NOT have the actual diff text for every file by default. The user may attach specific file diffs as additional context — use them when present.',
    'Be concise. Reference files by path. Call out risk, missing tests, and architectural concerns.',
    '',
    'MR_GRAPH (JSON):',
    JSON.stringify(skeleton),
  ].join('\n');
}

function stripFileSections(file: MrFileNode) {
  const { sections, ...rest } = file;
  return {
    ...rest,
    changedLineCount: countChangedLines(sections),
  };
}

function countChangedLines(sections: MrFileNode['sections']): number {
  let n = 0;
  for (const s of sections) {
    for (const line of s.lines) {
      if (line.diffType === 'add' || line.diffType === 'remove') n++;
    }
  }
  return n;
}

export function buildFileDiffContext(file: MrFileNode): string {
  const lines: string[] = [];
  lines.push(`=== FILE DIFF: ${file.filePath} (+${file.additions} −${file.deletions}) ===`);
  for (const section of file.sections) {
    if (section.header) lines.push(`@@ ${section.header} @@`);
    for (const line of section.lines) {
      const prefix = line.diffType === 'add' ? '+' : line.diffType === 'remove' ? '-' : ' ';
      lines.push(`${prefix}${line.text}`);
    }
  }
  return lines.join('\n');
}

export function attachFileDiffToUserMessage(
  userText: string,
  file: MrFileNode | null,
): string {
  if (!file) return userText;
  return `${userText}\n\n---\n\nAttached diff for context:\n\n\`\`\`diff\n${buildFileDiffContext(file)}\n\`\`\``;
}

export function findFileById(graph: MrGraph | null, fileId: string | null): MrFileNode | null {
  if (!graph || !fileId) return null;
  return graph.files.find(f => f.id === fileId) ?? null;
}
