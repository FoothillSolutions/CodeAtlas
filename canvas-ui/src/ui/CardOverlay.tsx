import type { JSX } from 'preact';
import { useComputed } from '@preact/signals';
import { nodePositions, files, arrowRoutes } from '../state/graph-store';
import { zoom, panX, panY, getEffectiveLodTier, lodFadeStates, selectedNodeId, hoveredNodeId, searchQuery, activeFilters, viewMode } from '../state/ui-store';
import { getReviewStatus } from '../state/review-store';
import { getChangedLines } from '../utils/diff-utils';
import { CodeLine } from './CodeLine';
import { colors, dimensions, fonts } from '../theme/tokens';

const TOOLBAR_HEIGHT = dimensions.toolbarHeight;
const HEADER_HEIGHT = dimensions.headerHeight;
const BODY_TOP_OFFSET = HEADER_HEIGHT + 1;

export function CardOverlay() {
  if (viewMode.value !== 'diff') return null;

  const positions = useComputed(() => nodePositions.value);
  const allFiles = useComputed(() => files.value);
  const currentZoom = useComputed(() => zoom.value);
  const currentPanX = useComputed(() => panX.value);
  const currentPanY = useComputed(() => panY.value);
  const fadeStates = useComputed(() => lodFadeStates.value);
  const selected = useComputed(() => selectedNodeId.value);
  const hovered = useComputed(() => hoveredNodeId.value);
  const query = useComputed(() => searchQuery.value.toLowerCase());
  const filters = useComputed(() => activeFilters.value);

  const connectedIds = useComputed(() => {
    const sel = selectedNodeId.value;
    if (!sel) return null;
    const ids = new Set<string>([sel]);
    for (const route of arrowRoutes.value) {
      if (route.fromFileId === sel || route.toFileId === sel) {
        ids.add(route.fromFileId);
        ids.add(route.toFileId);
      }
    }
    return ids;
  });

  const visibleFullNodes = useComputed(() => {
    const tier = getEffectiveLodTier();
    if (tier !== 'full') return [];
    return allFiles.value.filter(file => {
      const fade = fadeStates.value.get(file.id);
      return !fade || fade.targetTier === 'full';
    });
  });

  const z = currentZoom.value;
  const px = currentPanX.value;
  const py = currentPanY.value;

  return (
    <div style={styles.container}>
      {visibleFullNodes.value.map(file => {
        const pos = positions.value.get(file.id);
        if (!pos) return null;

        const reviewStatus = getReviewStatus(file.filePath);
        const reviewFilter = filters.value.reviewStatus;
        const dimmedBySearch = query.value.length > 0 && !file.fileName.toLowerCase().includes(query.value);
        const dimmedByReview = reviewFilter != null && reviewStatus !== reviewFilter;
        const dimmedBySelection = connectedIds.value !== null && !connectedIds.value.has(file.id);
        const isDimmed = dimmedBySearch || dimmedByReview || dimmedBySelection;

        const screenX = pos.x * z + px;
        const screenY = pos.y * z + py;
        const screenW = pos.width * z;
        const screenBodyTop = screenY + BODY_TOP_OFFSET * z;
        const screenBodyH = (pos.height - BODY_TOP_OFFSET) * z;

        if (screenX + screenW < 0 || screenX > window.innerWidth ||
            screenBodyTop + screenBodyH < 0 || screenBodyTop > window.innerHeight) {
          return null;
        }

        const visibleLines = getChangedLines(file);

        return (
          <div
            key={file.id}
            style={getCardOverlayStyle(screenX, screenBodyTop, pos.width, pos.height, z, isDimmed)}
          >
            {visibleLines.length === 0 ? (
              <div style={styles.noChangesMessage}>
                No changes in preview
              </div>
            ) : (
              visibleLines.map((vl, i) => {
                if (vl.isSeparator) {
                  return (
                    <div key={i} style={styles.separator}>
                      ···
                    </div>
                  );
                }
                const line = vl.line;
                return (
                  <CodeLine
                    key={i}
                    lineNum={line.lineNum}
                    text={line.text}
                    diffType={line.diffType}
                    language={file.fileType || 'other'}
                  />
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

const getCardOverlayStyle = (
  screenX: number,
  screenBodyTop: number,
  width: number,
  height: number,
  z: number,
  isDimmed: boolean
): JSX.CSSProperties => ({
  position: 'absolute',
  left: `${screenX + 1}px`,
  top: `${screenBodyTop}px`,
  width: `${width - 2}px`,
  height: `${height - BODY_TOP_OFFSET}px`,
  overflow: 'hidden',
  background: colors.bg.primary,
  fontFamily: fonts.mono,
  fontSize: '12px',
  lineHeight: '18px',
  transformOrigin: 'top left',
  transform: `scale(${z})`,
  opacity: isDimmed ? 0.2 : 1,
});

const styles = {
  container: {
    position: 'absolute',
    top: `${TOOLBAR_HEIGHT}px`,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 10,
  },
  noChangesMessage: {
    padding: '8px',
    color: colors.text.muted,
    fontSize: '11px',
    textAlign: 'center',
  },
  separator: {
    padding: '2px 8px',
    color: colors.text.muted,
    fontSize: '11px',
    background: colors.bg.canvas,
    borderTop: `1px solid ${colors.border.subtle}`,
    borderBottom: `1px solid ${colors.border.subtle}`,
    fontFamily: fonts.mono,
    userSelect: 'none',
    minHeight: '18px',
    lineHeight: '18px',
  },
} as const satisfies Record<string, JSX.CSSProperties>;
