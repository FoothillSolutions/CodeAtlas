import { Component } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { colors } from '../theme/tokens';

interface Props {
  children: ComponentChildren;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('CodeAtlas render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.title}>Something went wrong</div>
            <pre style={styles.errorText}>{this.state.error.message}</pre>
            <button
              style={styles.retryButton}
              onClick={() => this.setState({ error: null })}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.bg.canvas,
  },
  card: {
    background: colors.bg.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: '8px',
    padding: '24px 32px',
    maxWidth: '500px',
    textAlign: 'center',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: colors.text.primary,
    marginBottom: '12px',
  },
  errorText: {
    fontSize: '12px',
    color: colors.diff.removeText,
    background: colors.bg.secondary,
    padding: '8px 12px',
    borderRadius: '4px',
    overflow: 'auto',
    maxHeight: '200px',
    textAlign: 'left' as const,
    marginBottom: '16px',
  },
  retryButton: {
    background: colors.bg.tertiary,
    border: `1px solid ${colors.border.default}`,
    color: colors.text.secondary,
    padding: '6px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
  },
} as const satisfies Record<string, JSX.CSSProperties>;
