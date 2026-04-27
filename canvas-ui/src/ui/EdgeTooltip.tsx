import type { JSX } from 'preact';
import { hoveredEdgeIndex } from '../state/ui-store';
import { arrowRoutes } from '../state/graph-store';
import { colors } from '../theme/tokens';

export function EdgeTooltip() {
  const idx = hoveredEdgeIndex.value;
  if (idx === null) return null;

  const route = arrowRoutes.value[idx];
  if (!route) return null;

  return (
    <div style={styles.container}>
      <div style={styles.interfaceName}>
        {route.interfaceName}
      </div>
      {route.paramName && (
        <div style={styles.paramName}>
          param: {route.paramName}
        </div>
      )}
      {route.methodCalls.length > 0 && (
        <div style={styles.methodCallsContainer}>
          {route.methodCalls.map((call, i) => (
            <div key={i} style={styles.methodCall}>
              {call}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    left: '50%',
    bottom: '20px',
    transform: 'translateX(-50%)',
    background: colors.bg.secondary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '12px',
    zIndex: 200,
    maxWidth: '320px',
    boxShadow: colors.tooltip.shadow,
    color: colors.text.secondary,
  },
  interfaceName: {
    color: colors.tooltip.interfaceName,
    fontWeight: 600,
    fontSize: '13px',
  },
  paramName: {
    color: colors.text.tertiary,
    fontSize: '11px',
  },
  methodCallsContainer: {
    marginTop: '6px',
    borderTop: `1px solid ${colors.border.default}`,
    paddingTop: '6px',
  },
  methodCall: {
    color: colors.tooltip.methodCall,
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '1px 0',
  },
} as const satisfies Record<string, JSX.CSSProperties>;
