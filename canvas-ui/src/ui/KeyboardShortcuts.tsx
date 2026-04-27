import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { files } from '../state/graph-store';
import {
  selectedNodeId,
  expandedNodeId,
  selectNode,
  expandNode,
  zoom,
  panX,
  panY,
  setZoom,
  setPan,
  searchVisible,
  markDirty,
  cycleLodPinMode,
  toggleOverlay,
} from '../state/ui-store';
import { setReviewStatus } from '../state/review-store';
import { toggleChatPanel } from '../state/chat-store';
import { colors } from '../theme/tokens';

const showHelp = signal(false);

const PAN_STEP = 50;

export const shortcuts: { key: string; description: string }[] = [
  { key: 'Tab', description: 'Select next file' },
  { key: 'Shift+Tab', description: 'Select previous file' },
  { key: 'Enter', description: 'Expand selected node (open code card)' },
  { key: 'Escape', description: 'Close expanded node / search / help overlay' },
  { key: '+ / =', description: 'Zoom in' },
  { key: '-', description: 'Zoom out' },
  { key: '0', description: 'Fit all nodes in view' },
  { key: 'r', description: 'Mark selected file as reviewed' },
  { key: 'f', description: 'Mark selected file as flagged' },
  { key: 'u', description: 'Mark selected file as unreviewed' },
  { key: 's', description: 'Cycle LOD mode: auto → glyph → full' },
  { key: 'h', description: 'Toggle risk heatmap overlay' },
  { key: 'i', description: 'Toggle critical paths overlay' },
  { key: 'a', description: 'Toggle AI review chat panel' },
  { key: '↑', description: 'Pan up' },
  { key: '↓', description: 'Pan down' },
  { key: '←', description: 'Pan left' },
  { key: '→', description: 'Pan right' },
  { key: '?', description: 'Toggle this help overlay' },
];

interface KeyboardShortcutsProps {
  onFitAll: () => void;
}

export function KeyboardShortcuts({ onFitAll }: KeyboardShortcutsProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key;

      // Tab / Shift+Tab: cycle through files
      if (key === 'Tab') {
        e.preventDefault();
        const fileList = files.value;
        if (fileList.length === 0) return;

        const currentId = selectedNodeId.value;
        const currentIndex = currentId
          ? fileList.findIndex(f => f.id === currentId)
          : -1;

        let nextIndex: number;
        if (e.shiftKey) {
          nextIndex = currentIndex <= 0 ? fileList.length - 1 : currentIndex - 1;
        } else {
          nextIndex = currentIndex >= fileList.length - 1 ? 0 : currentIndex + 1;
        }

        const nextId = fileList[nextIndex].id;
        if (expandedNodeId.value) {
          expandNode(nextId);
        }
        selectNode(nextId);
        return;
      }

      // Enter: expand selected node
      if (key === 'Enter') {
        e.preventDefault();
        if (selectedNodeId.value) {
          expandNode(
            expandedNodeId.value === selectedNodeId.value ? null : selectedNodeId.value,
          );
        }
        return;
      }

      // Escape: close things in priority order
      if (key === 'Escape') {
        e.preventDefault();
        if (showHelp.value) {
          showHelp.value = false;
        } else if (expandedNodeId.value) {
          expandNode(null);
        } else if (searchVisible.value) {
          searchVisible.value = false;
        }
        return;
      }

      // Zoom in
      if (key === '+' || key === '=') {
        e.preventDefault();
        setZoom(zoom.value + 0.1);
        return;
      }

      // Zoom out
      if (key === '-') {
        e.preventDefault();
        setZoom(zoom.value - 0.1);
        return;
      }

      // Fit all
      if (key === '0') {
        e.preventDefault();
        onFitAll();
        return;
      }

      if ((key === 'r' || key === 'f' || key === 'u') && selectedNodeId.value) {
        e.preventDefault();
        const file = files.value.find(f => f.id === selectedNodeId.value);
        if (!file) return;
        const statusMap: Record<string, 'reviewed' | 'flagged' | 'unreviewed'> = {
          r: 'reviewed', f: 'flagged', u: 'unreviewed',
        };
        setReviewStatus(file.filePath, statusMap[key]);
        markDirty();
        return;
      }

      const panMap: Record<string, [number, number]> = {
        ArrowUp:    [0,  PAN_STEP],
        ArrowDown:  [0, -PAN_STEP],
        ArrowLeft:  [ PAN_STEP, 0],
        ArrowRight: [-PAN_STEP, 0],
      };
      if (key in panMap) {
        e.preventDefault();
        const [dx, dy] = panMap[key];
        setPan(panX.value + dx, panY.value + dy);
        return;
      }

      if (key === '?') {
        e.preventDefault();
        showHelp.value = !showHelp.value;
        return;
      }

      const overlayMap: Record<string, 'risk-heatmap' | 'critical-paths'> = {
        h: 'risk-heatmap',
        i: 'critical-paths',
      };
      if (key in overlayMap) {
        e.preventDefault();
        toggleOverlay(overlayMap[key]);
        return;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onFitAll]);

  if (!showHelp.value) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: colors.bg.overlayDark,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={() => (showHelp.value = false)}
    >
      <div
        style={{
          background: colors.bg.primary,
          border: `1px solid ${colors.border.default}`,
          borderRadius: '12px',
          padding: '24px 32px',
          maxWidth: '480px',
          width: '90vw',
          maxHeight: '80vh',
          overflowY: 'auto',
          color: colors.text.secondary,
        }}
        onClick={(e: Event) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: colors.text.primary,
            borderBottom: `1px solid ${colors.border.default}`,
            paddingBottom: '12px',
          }}
        >
          Keyboard Shortcuts
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {shortcuts.map(s => (
              <tr key={s.key} style={{ borderBottom: `1px solid ${colors.border.subtle}` }}>
                <td
                  style={{
                    padding: '8px 12px 8px 0',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'top',
                  }}
                >
                  <kbd
                    style={{
                      background: colors.bg.tertiary,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      color: colors.text.secondary,
                    }}
                  >
                    {s.key}
                  </kbd>
                </td>
                <td
                  style={{
                    padding: '8px 0',
                    fontSize: '14px',
                    color: colors.text.tertiary,
                  }}
                >
                  {s.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p
          style={{
            margin: '16px 0 0 0',
            fontSize: '12px',
            color: colors.text.muted,
            textAlign: 'center',
          }}
        >
          Press <kbd style={{ background: colors.bg.tertiary, border: `1px solid ${colors.border.default}`, borderRadius: '4px', padding: '1px 5px', fontFamily: 'monospace', fontSize: '12px' }}>?</kbd> or <kbd style={{ background: colors.bg.tertiary, border: `1px solid ${colors.border.default}`, borderRadius: '4px', padding: '1px 5px', fontFamily: 'monospace', fontSize: '12px' }}>Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
