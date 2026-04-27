import type { MrFileNode, MrCodeLine } from '../types';

export interface VisibleLine {
  line: MrCodeLine;
  isSeparator: boolean;
}

const CONTEXT_LINES = 1;

export function getChangedLines(file: MrFileNode): VisibleLine[] {
  const allLines: MrCodeLine[] = [];
  for (const section of file.sections) {
    for (const line of section.lines) {
      allLines.push(line);
    }
  }

  if (allLines.length === 0) return [];

  const changedIndices = new Set<number>();
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].diffType === 'add' || allLines[i].diffType === 'remove') {
      for (let c = Math.max(0, i - CONTEXT_LINES); c <= Math.min(allLines.length - 1, i + CONTEXT_LINES); c++) {
        changedIndices.add(c);
      }
    }
  }

  if (changedIndices.size === 0) return [];

  const sorted = Array.from(changedIndices).sort((a, b) => a - b);
  const result: VisibleLine[] = [];
  let prevIdx = -2;

  for (const idx of sorted) {
    if (prevIdx >= 0 && idx - prevIdx > 1) {
      result.push({ line: { lineNum: 0, text: '···', diffType: 'context' }, isSeparator: true });
    }
    result.push({ line: allLines[idx], isSeparator: false });
    prevIdx = idx;
  }

  return result;
}
