import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { JSX } from 'preact';
import { expandedNodeId, selectNode } from '../state/ui-store';
import { files } from '../state/graph-store';
import { cycleReviewStatus, getReviewStatus } from '../state/review-store';
import type { ReviewStatus } from '../state/review-store';
import { CodeLine } from './CodeLine';
import type { MrCodeSection } from '../types';
import { colors } from '../theme/tokens';

const reviewStatusBg: Record<ReviewStatus, string> = {
  reviewed: colors.review.reviewedBg,
  flagged: colors.review.flaggedBg,
  'needs-attention': colors.review.attentionBg,
  unreviewed: colors.bg.tertiary,
};

const reviewStatusLabel: Record<ReviewStatus, string> = {
  unreviewed: 'Mark Reviewed',
  reviewed: 'Reviewed',
  flagged: 'Flagged',
  'needs-attention': 'Attention',
};

function SmallButton({ onClick, children }: { onClick: () => void; children: ComponentChildren }) {
  return (
    <button
      onClick={onClick}
      style={styles.smallButton}
    >
      {children}
    </button>
  );
}

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

  expandedNodeId.value = fileList[nextIndex].id;
  selectNode(fileList[nextIndex].id);
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

  return (
    <div
      style={styles.overlay}
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
        style={styles.cardContainer}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.cardHeader}>
          <span style={styles.fileName}>
            {file.fileName}
          </span>

          {file.isNew && (
            <span style={styles.newBadge}>
              NEW
            </span>
          )}

          {file.isChanged && (file.additions > 0 || file.deletions > 0) && (
            <span style={styles.diffStats}>
              <span style={styles.additionsText}>+{file.additions}</span>
              {' '}
              <span style={styles.deletionsText}>-{file.deletions}</span>
            </span>
          )}

          {file.sections.length > 1 && (
            <>
              <SmallButton onClick={() => setCollapsedSections(new Set())}>Expand All</SmallButton>
              <SmallButton onClick={() => setCollapsedSections(new Set(file.sections.map((_, i) => i)))}>Collapse All</SmallButton>
            </>
          )}

          <button
            onClick={() => cycleReviewStatus(file.filePath)}
            style={getReviewStatusButtonStyle(reviewStatus)}
          >
            {reviewStatusLabel[reviewStatus]}
          </button>

          <button
            onClick={() => expandedNodeId.value = null}
            style={styles.closeButton}
          >
            x
          </button>
        </div>

        <div style={styles.filePath}>
          {file.filePath}
        </div>

        <div style={styles.codeContainer}>
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
            <div style={styles.noDiffMessage}>
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
    <div style={styles.hiddenLinesBar}>
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
  return (
    <div>
      <div
        onClick={onToggle}
        style={getSectionHeaderStyle(collapsed, sectionIndex)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bg.secondary; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = collapsed ? colors.bg.secondary : colors.bg.primary; }}
      >
        <span style={styles.sectionArrow}>
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
        <span style={styles.sectionLabel}>
          {section.header || `Section ${sectionIndex + 1}`}
        </span>
        {collapsed && (
          <span style={styles.sectionLineCount}>
            {section.lines.length} lines
          </span>
        )}
      </div>

      {!collapsed && section.lines.map((line, li) => (
        <CodeLine key={li} lineNum={line.lineNum} text={line.text} diffType={line.diffType} language={fileType} />
      ))}
    </div>
  );
}

const getReviewStatusButtonStyle = (reviewStatus: ReviewStatus): JSX.CSSProperties => ({
  background: reviewStatusBg[reviewStatus],
  border: `1px solid ${colors.border.default}`,
  color: '#fff',
  padding: '2px 8px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '11px',
});

const getSectionHeaderStyle = (collapsed: boolean, sectionIndex: number): JSX.CSSProperties => ({
  padding: '3px 12px',
  background: collapsed ? colors.bg.secondary : colors.bg.primary,
  color: colors.text.tertiary,
  fontSize: '11px',
  fontFamily: '"SF Mono", "Fira Code", Consolas, monospace',
  borderTop: sectionIndex > 0 ? `1px solid ${colors.border.subtle}` : 'none',
  cursor: 'pointer',
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: colors.bg.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 150,
  },
  cardContainer: {
    width: '85vw',
    maxWidth: '1100px',
    maxHeight: '85vh',
    background: colors.bg.primary,
    border: `2px solid ${colors.node.changed}`,
    borderRadius: '8px',
    boxShadow: colors.tooltip.shadow,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  cardHeader: {
    padding: '10px 14px',
    background: colors.bg.secondary,
    borderBottom: `1px solid ${colors.border.default}`,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  fileName: {
    fontWeight: 600,
    fontSize: '13px',
    color: colors.text.primary,
    flex: 1,
  },
  newBadge: {
    background: colors.review.reviewedBg,
    color: '#fff',
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '8px',
    fontWeight: 600,
  },
  diffStats: {
    fontSize: '12px',
    fontWeight: 600,
  },
  additionsText: {
    color: colors.diff.addText,
  },
  deletionsText: {
    color: colors.diff.removeText,
  },
  smallButton: {
    background: colors.bg.tertiary,
    border: `1px solid ${colors.border.default}`,
    color: colors.text.tertiary,
    padding: '2px 6px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '10px',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: colors.text.tertiary,
    cursor: 'pointer',
    fontSize: '16px',
    padding: '0 4px',
    lineHeight: 1,
  },
  filePath: {
    padding: '4px 14px',
    fontSize: '10px',
    color: colors.text.faint,
    background: colors.bg.primary,
    borderBottom: `1px solid ${colors.border.subtle}`,
    flexShrink: 0,
  },
  codeContainer: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'auto',
    padding: '4px 0',
    fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
    fontSize: '12px',
    lineHeight: '18px',
  },
  noDiffMessage: {
    padding: '16px',
    color: colors.text.muted,
    fontSize: '12px',
    textAlign: 'center',
  },
  hiddenLinesBar: {
    padding: '3px 0',
    textAlign: 'center',
    fontSize: '11px',
    color: colors.text.muted,
    background: colors.bg.canvas,
    borderTop: `1px solid ${colors.border.subtle}`,
    borderBottom: `1px solid ${colors.border.subtle}`,
    fontFamily: '"SF Mono", "Fira Code", Consolas, monospace',
    userSelect: 'none',
  },
  sectionArrow: {
    fontSize: '10px',
    color: colors.node.changed,
    width: '12px',
    flexShrink: 0,
  },
  sectionLabel: {
    color: colors.text.muted,
    fontStyle: 'italic',
    flex: 1,
  },
  sectionLineCount: {
    color: colors.text.muted,
    fontSize: '10px',
  },
} as const satisfies Record<string, JSX.CSSProperties>;
