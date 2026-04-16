import { hoveredEdgeIndex } from '../state/ui-store';
import { arrowRoutes } from '../state/graph-store';

export function EdgeTooltip() {
  const idx = hoveredEdgeIndex.value;
  if (idx === null) return null;

  const route = arrowRoutes.value[idx];
  if (!route) return null;

  return (
    <div style={{
      position: 'fixed',
      left: '50%',
      bottom: '20px',
      transform: 'translateX(-50%)',
      background: '#1c2128',
      border: '1px solid #30363d',
      borderRadius: '8px',
      padding: '10px 14px',
      fontSize: '12px',
      zIndex: 200,
      maxWidth: '320px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      color: '#c9d1d9',
    }}>
      <div style={{ color: '#79c0ff', fontWeight: 600, fontSize: '13px' }}>
        {route.interfaceName}
      </div>
      {route.paramName && (
        <div style={{ color: '#8b949e', fontSize: '11px' }}>
          param: {route.paramName}
        </div>
      )}
      {route.methodCalls.length > 0 && (
        <div style={{ marginTop: '6px', borderTop: '1px solid #30363d', paddingTop: '6px' }}>
          {route.methodCalls.map((call, i) => (
            <div key={i} style={{ color: '#7ee787', fontFamily: 'monospace', fontSize: '11px', padding: '1px 0' }}>
              {call}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
