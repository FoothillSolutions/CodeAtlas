import type { JSX } from 'preact';
import { selectedNodeId, viewMode, selectNode } from '../state/ui-store';
import { forceNodes, files } from '../state/graph-store';
import { CodeLine } from './CodeLine';
import { colors } from '../theme/tokens';

export function GraphCodePanel() {
  const mode = viewMode.value;
  const selectedId = selectedNodeId.value;

  if (mode !== 'graph' || !selectedId) return null;

  const node = forceNodes.value.find(n => n.id === selectedId);
  if (!node) return null;

  const fileId = node.classNode.fileId;
  const file = files.value.find(f => f.id === fileId);
  if (!file) return null;

  const className = node.classNode.className;
  const fileName = file.fileName;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.className}>{className}</div>
          <div style={styles.fileName}>{fileName}</div>
        </div>
        <button
          style={styles.closeButton}
          onClick={() => selectNode(null)}
        >
          ×
        </button>
      </div>
      <div style={styles.codeArea}>
        {file.sections.map((section, sectionIdx) => (
          <div key={sectionIdx}>
            {section.header && (
              <div style={styles.sectionHeader}>{section.header}</div>
            )}
            {section.lines.map((line, lineIdx) => (
              <CodeLine
                key={lineIdx}
                lineNum={line.lineNum}
                text={line.text}
                diffType={line.diffType}
                language={file.fileType}
                wrap
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  panel: {
    position: 'fixed',
    left: 0,
    top: '44px',
    bottom: 0,
    width: '420px',
    background: colors.bg.secondary,
    borderRight: `1px solid ${colors.border.default}`,
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: colors.bg.primary,
    borderBottom: `1px solid ${colors.border.default}`,
  },
  headerContent: {
    flex: 1,
    minWidth: 0,
  },
  className: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: '4px',
  },
  fileName: {
    fontSize: '12px',
    color: colors.text.tertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: colors.text.tertiary,
    fontSize: '24px',
    cursor: 'pointer',
    padding: '0 4px',
    marginLeft: '12px',
    lineHeight: '24px',
  },
  codeArea: {
    flex: 1,
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '12px',
  },
  sectionHeader: {
    padding: '8px 16px',
    color: colors.text.muted,
    fontSize: '11px',
    borderTop: `1px solid ${colors.border.subtle}`,
    background: colors.bg.primary,
  },
} as const satisfies Record<string, JSX.CSSProperties>;
