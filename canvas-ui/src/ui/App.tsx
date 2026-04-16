import { useRef, useEffect } from 'preact/hooks';
import { computed } from '@preact/signals';
import { graphData, nodePositions, setNodePositions, setArrowRoutes, setProjectGroups } from '../state/graph-store';
import { zoom, panX, panY, expandedNodeId, hoveredEdgeIndex } from '../state/ui-store';
import { initCanvas, destroyCanvas } from '../canvas/canvas-renderer';
import { setupInteraction, cleanupInteraction } from '../canvas/interaction';
import { computeLayout } from '../layout/dagre-layout';
import { routeArrows } from '../layout/arrow-router';
import { Toolbar } from './Toolbar';
import { EdgeTooltip } from './EdgeTooltip';
import { CodeCard } from './CodeCard';
import { KeyboardShortcuts } from './KeyboardShortcuts';

// Run layout when graph data is available
const layoutReady = computed(() => {
  const data = graphData.value;
  if (!data || data.files.length === 0) return false;

  const config = data.config;
  const result = computeLayout(data, config?.nodeWidth ?? 520, config?.rankDirection ?? 'LR');
  setNodePositions(result.positions);
  setProjectGroups(result.groups);

  // Route arrows after layout
  const routes = routeArrows(data.edges, result.positions);
  setArrowRoutes(routes.map((r, i) => ({
    edgeId: `edge-${i}`,
    waypoints: r.waypoints,
    fromFileId: r.edge.fromFileId,
    toFileId: r.edge.toFileId,
    type: r.edge.type,
    interfaceName: r.edge.interfaceName,
    paramName: r.edge.paramName,
    methodCalls: r.edge.methodCalls,
  })));

  return true;
});

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      initCanvas(canvasRef.current);
      setupInteraction(canvasRef.current);

      // Apply default zoom from config
      const config = graphData.value?.config;
      if (config?.defaultZoom) {
        zoom.value = config.defaultZoom;
      }

      // Fit all after initial layout
      requestAnimationFrame(() => {
        if (layoutReady.value) {
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
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0d1117' }}>
      <Toolbar onFitAll={() => canvasRef.current && fitAll(canvasRef.current)} />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: '44px',
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: 'calc(100vh - 44px)',
          cursor: 'grab',
        }}
      />
      <EdgeTooltip />
      <CodeCard />
      <KeyboardShortcuts onFitAll={() => canvasRef.current && fitAll(canvasRef.current)} />
    </div>
  );
}

function fitAll(canvas: HTMLCanvasElement) {
  const positions = nodePositions.value;
  if (positions.size === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  positions.forEach(pos => {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  });

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
