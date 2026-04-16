import { useState } from 'preact/hooks';
import { expandedNodeId, selectNode } from '../state/ui-store';
import { files } from '../state/graph-store';
import { getReviewStatus, setReviewStatus, cycleReviewStatus } from '../state/review-store';
import type { ReviewStatus } from '../state/review-store';
import { CodeLine } from './CodeLine';
import type { MrFileNode, MrCodeSection } from '../types';

function navigateFile(direction: 1 | -1) {
  const nodeId = expandedNodeId.value;
  if (!nodeId) return;
  const fileList = files.value;
  const currentIndex = fileList.findIndex(f => f.id === nodeId);
  if (currentIndex === -1) return;

  let nextIndex: number;
  if (direction === 1) {
    nextIndex = currentIndex >= fileList.length - 1 ? 0 : currentIndex + 1;
  } else {
    nextIndex = currentIndex <= 0 ? fileList.length - 1 : currentIndex - 1;
  }

  const nextId = fileList[nextIndex].id;
  expandedNodeId.value = nextId;
  selectNode(nextId);
}
export function CodeCard() {
  const nodeId = expandedNodeId.value;
  if (!nodeId) return null;

  const file = files.value.find(f => f.id === nodeId);
  if (!file) return null;

  const reviewStatus = getReviewStatus(file.filePath);

  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());

  const toggleSection = (index: number) => {
    const next = new Set(collapsedSections);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setCollapsedSections(next);
  };

  const expandAll = () => setCollapsedSections(new Set());
  const collapseAll = () => setCollapsedSections(new Set(file.sections.map((_, i) => i)));

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150,
      }}
      onClick={() => expandedNodeId.value = null}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          navigateFile(e.shiftKey ? -1 : 1);
        }
      }}
    >
    <div
      style={{
        width: '85vw',
        maxWidth: '1100px',
        maxHeight: '85vh',
        background: '#161b22',
        border: '2px solid #58a6ff',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        background: '#1c2128',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: '13px', color: '#f0f6fc', flex: 1 }}>
          {file.fileName}
        </span>

        {file.isNew && (
          <span style={{ background: '#238636', color: '#fff', fontSize: '10px', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>
            NEW
          </span>
        )}

        {file.isChanged && (file.additions > 0 || file.deletions > 0) && (
          <span style={{ fontSize: '12px', fontWeight: 600 }}>
            <span style={{ color: '#3fb950' }}>+{file.additions}</span>
            {' '}
            <span style={{ color: '#f85149' }}>-{file.deletions}</span>
          </span>
        )}

        {/* Expand All / Collapse All buttons */}
        {file.sections.length > 1 && (
          <>
            <button
              onClick={expandAll}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#8b949e',
                padding: '2px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '10px',
              }}
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#8b949e',
                padding: '2px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '10px',
              }}
            >
              Collapse All
            </button>
          </>
        )}

        {/* Review status button */}
        <button
          onClick={() => cycleReviewStatus(file.filePath)}
          style={{
            background: reviewStatus === 'reviewed' ? '#238636'
              : reviewStatus === 'flagged' ? '#da3633'
              : reviewStatus === 'needs-attention' ? '#9e6a03'
              : '#21262d',
            border: '1px solid #30363d',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          {reviewStatus === 'unreviewed' ? 'Mark Reviewed'
           : reviewStatus === 'reviewed' ? 'Reviewed'
           : reviewStatus === 'flagged' ? 'Flagged'
           : 'Attention'}
        </button>

        {/* Close button */}
        <button
          onClick={() => expandedNodeId.value = null}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>

      {/* File path */}
      <div style={{
        padding: '4px 14px',
        fontSize: '10px',
        color: '#6e7681',
        background: '#161b22',
        borderBottom: '1px solid #21262d',
        flexShrink: 0,
      }}>
        {file.filePath}
      </div>

      {/* Code content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'auto',
        padding: '4px 0',
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
        fontSize: '12px',
        lineHeight: '18px',
      }}>
        {file.sections.length > 0 ? (
          file.sections.map((section, si) => (
            <>
              {si > 0 && <HiddenLinesBar prevSection={file.sections[si - 1]} nextSection={section} />}
              <CodeSection
                key={si}
                section={section}
                sectionIndex={si}
                fileType={file.fileType || 'other'}
                collapsed={collapsedSections.has(si)}
                onToggle={() => toggleSection(si)}
              />
            </>
          ))
        ) : (
          <div style={{ padding: '16px', color: '#484f58', fontSize: '12px', textAlign: 'center' }}>
            No diff sections (unchanged dependency)
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

function HiddenLinesBar({ prevSection, nextSection }: { prevSection: MrCodeSection; nextSection: MrCodeSection }) {
  const prevLines = prevSection.lines;
  const nextLines = nextSection.lines;

  if (prevLines.length === 0 || nextLines.length === 0) return null;

  const lastLineNum = prevLines[prevLines.length - 1].lineNum;
  const firstLineNum = nextLines[0].lineNum;

  if (lastLineNum <= 0 || firstLineNum <= 0) return null;

  const hiddenCount = firstLineNum - lastLineNum - 1;
  if (hiddenCount <= 0) return null;

  return (
    <div style={{
      padding: '3px 0',
      textAlign: 'center',
      fontSize: '11px',
      color: '#484f58',
      background: '#0d1117',
      borderTop: '1px solid #21262d',
      borderBottom: '1px solid #21262d',
      fontFamily: '"SF Mono", "Fira Code", Consolas, monospace',
      userSelect: 'none',
    }}>
      {'··· '}{hiddenCount}{' lines hidden ···'}
    </div>
  );
}

function CodeSection({ section, sectionIndex, fileType, collapsed, onToggle }: {
  section: MrCodeSection;
  sectionIndex: number;
  fileType: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const lineCount = section.lines.length;

  return (
    <div>
      {/* Clickable hunk header */}
      <div
        onClick={onToggle}
        style={{
          padding: '3px 12px',
          background: collapsed ? '#1c2128' : '#161b22',
          color: '#8b949e',
          fontSize: '11px',
          fontFamily: '"SF Mono", "Fira Code", Consolas, monospace',
          borderTop: sectionIndex > 0 ? '1px solid #21262d' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1c2128'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = collapsed ? '#1c2128' : '#161b22'; }}
      >
        <span style={{ fontSize: '10px', color: '#58a6ff', width: '12px', flexShrink: 0 }}>
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
        <span style={{ color: '#484f58', fontStyle: 'italic', flex: 1 }}>
          {section.header || `Section ${sectionIndex + 1}`}
        </span>
        {collapsed && (
          <span style={{ color: '#484f58', fontSize: '10px' }}>
            {lineCount} lines
          </span>
        )}
      </div>

      {/* Lines (visible when expanded) */}
      {!collapsed && section.lines.map((line, li) => (
        <CodeLine key={li} lineNum={line.lineNum} text={line.text} diffType={line.diffType} language={fileType} />
      ))}
    </div>
  );
}
