import { useRef, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { effect } from '@preact/signals';
import { graphData, nodePositions, relayout, relayoutArch, archLayout } from '../state/graph-store';
import { zoom, panX, panY, lodPinMode, viewMode, expandedProjects } from '../state/ui-store';
import { initCanvas, destroyCanvas } from '../canvas/canvas-renderer';
import { setupInteraction, cleanupInteraction } from '../canvas/interaction';
import { Toolbar } from './Toolbar';
import { EdgeTooltip } from './EdgeTooltip';
import { CodeCard } from './CodeCard';
import { CardOverlay } from './CardOverlay';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { ChatPanel } from './ChatPanel';
import { colors } from '../theme/tokens';

const disposeLayoutEffect = effect(() => {
  const data = graphData.value;
  if (!data || data.files.length === 0) return;
  relayout(data);
});

const disposeArchLayoutEffect = effect(() => {
  const data = graphData.value;
  if (!data || data.files.length === 0) return;
  const mode = viewMode.value;
  if (mode !== 'arch') return;
  const expanded = expandedProjects.value;
  relayoutArch(data, expanded);
});

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      initCanvas(canvasRef.current);
      setupInteraction(canvasRef.current);

      const config = graphData.value?.config;
      if (config?.defaultZoom) {
        zoom.value = config.defaultZoom;
      }

      requestAnimationFrame(() => {
        if (nodePositions.value.size > 0) {
          fitAll(canvasRef.current!);
        }
      });
    }
    return () => {
      destroyCanvas();
      if (canvasRef.current) cleanupInteraction(canvasRef.current);
    };
  }, []);

  return (
    <div style={styles.appContainer}>
      <Toolbar onFitAll={() => canvasRef.current && fitAll(canvasRef.current)} />
      <canvas
        ref={canvasRef}
        style={styles.canvas}
      />
      <EdgeTooltip />
      <CardOverlay />
      <CodeCard />
      <KeyboardShortcuts onFitAll={() => canvasRef.current && fitAll(canvasRef.current)} />
      <ChatPanel />
      {lodPinMode.value !== 'auto' && (
        <div style={styles.lodIndicator}>
          LOD: {lodPinMode.value}
        </div>
      )}
    </div>
  );
}

function fitAll(canvas: HTMLCanvasElement) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  if (viewMode.value === 'arch') {
    const layout = archLayout.value;
    if (!layout || layout.projectPositions.size === 0) return;
    layout.projectPositions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    });
  } else {
    const positions = nodePositions.value;
    if (positions.size === 0) return;
    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    });
  }

  const padding = 80;
  const graphW = maxX - minX + padding * 2;
  const graphH = maxY - minY + padding * 2;
  const canvasW = canvas.getBoundingClientRect().width;
  const canvasH = canvas.getBoundingClientRect().height;

  const newZoom = Math.min(canvasW / graphW, canvasH / graphH, 1.2);
  zoom.value = newZoom;
  panX.value = (canvasW - graphW * newZoom) / 2 - minX * newZoom + padding * newZoom;
  panY.value = (canvasH - graphH * newZoom) / 2 - minY * newZoom + padding * newZoom;
}

const styles = {
  appContainer: {
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: '#0d1117',
  },
  canvas: {
    position: 'absolute',
    top: '44px',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: 'calc(100vh - 44px)',
    cursor: 'grab',
  },
  lodIndicator: {
    position: 'fixed',
    bottom: '12px',
    left: '12px',
    background: colors.bg.secondary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '12px',
    color: colors.text.tertiary,
    pointerEvents: 'none',
    zIndex: 100,
  },
} as const satisfies Record<string, JSX.CSSProperties>;
