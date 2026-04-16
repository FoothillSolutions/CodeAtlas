import { useState } from 'preact/hooks';
import { branchName, stats } from '../state/graph-store';
import { zoom, setZoom, setPan, activeFilters, markDirty, semanticZoomEnabled, toggleSemanticZoom, layoutLocked } from '../state/ui-store';
import { reviewProgress } from '../state/review-store';
import { shortcuts } from './KeyboardShortcuts';

interface ToolbarProps {
  onFitAll: () => void;
}

export function Toolbar({ onFitAll }: ToolbarProps) {
  const s = stats.value;
  const progress = reviewProgress.value;
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <>
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: '#161b22', borderBottom: '1px solid #30363d',
      padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px',
      fontSize: '13px', color: '#c9d1d9', height: '44px',
    }}>
      <span style={{ fontWeight: 600, fontSize: '15px', color: '#f0f6fc' }}>
        CodeAtlas
      </span>
      <span style={{ color: '#58a6ff', fontFamily: 'monospace', fontSize: '13px' }}>
        {branchName.value}
      </span>
      <span style={{
        background: '#30363d', padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
      }}>
        {s.totalFiles} files
      </span>
      <span style={{ fontSize: '12px' }}>
        <span style={{ color: '#3fb950' }}>+{s.totalAdditions}</span>
        {' '}
        <span style={{ color: '#f85149' }}>-{s.totalDeletions}</span>
      </span>

      {progress.total > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#8b949e' }}>
            {progress.reviewed}/{progress.total} reviewed
          </span>
          {/* Progress bar */}
          <span style={{
            display: 'inline-block', width: '80px', height: '4px',
            background: '#30363d', borderRadius: '2px', overflow: 'hidden',
          }}>
            <span style={{
              display: 'block', height: '100%', borderRadius: '2px',
              background: '#3fb950',
              width: `${Math.round((progress.reviewed / progress.total) * 100)}%`,
              transition: 'width 0.2s ease',
            }} />
          </span>
          {/* Filter buttons */}
          <span style={{ display: 'flex', gap: '2px' }}>
            <FilterButton value={null} label="All" />
            <FilterButton value="unreviewed" label="Unreviewed" />
            <FilterButton value="flagged" label="Flagged" />
          </span>
        </span>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
        <SwitchVizButton />
        <ToolbarButton
          onClick={() => { layoutLocked.value = !layoutLocked.value; }}
          active={layoutLocked.value}
        >
          {layoutLocked.value ? '\uD83D\uDD12 Locked' : '\uD83D\uDD13 Unlocked'}
        </ToolbarButton>
        <ToolbarButton
          onClick={toggleSemanticZoom}
          active={semanticZoomEnabled.value}
        >
          {semanticZoomEnabled.value ? 'Overview: On' : 'Overview: Off'}
        </ToolbarButton>
        <span style={{ width: '1px', height: '20px', background: '#30363d' }} />
        <ToolbarButton onClick={() => setZoom(zoom.value * 1.2)}>+</ToolbarButton>
        <ToolbarButton onClick={() => setZoom(zoom.value * 0.8)}>-</ToolbarButton>
        <ToolbarButton onClick={onFitAll}>Fit</ToolbarButton>
        <ToolbarButton onClick={() => { setZoom(1); setPan(0, 0); }}>Reset</ToolbarButton>
      </div>
    </div>

    <div
      style={{ position: 'fixed', bottom: '16px', left: '16px', zIndex: 100 }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button style={{
        background: '#21262d', border: '1px solid #30363d', borderRadius: '50%',
        color: '#8b949e', cursor: 'pointer', fontSize: '16px', fontWeight: 600,
        width: '36px', height: '36px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 0,
      }}>?</button>
      {showTooltip && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: '8px',
          background: '#1c2128', border: '1px solid #30363d', borderRadius: '8px',
          padding: '12px 16px', zIndex: 200, whiteSpace: 'nowrap',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0f6fc', marginBottom: '8px', borderBottom: '1px solid #30363d', paddingBottom: '6px' }}>
            Keyboard Shortcuts
          </div>
          {shortcuts.map(sc => (
            <div key={sc.key} style={{ display: 'flex', gap: '12px', padding: '3px 0', fontSize: '12px' }}>
              <kbd style={{
                background: '#21262d', border: '1px solid #30363d', borderRadius: '4px',
                padding: '1px 6px', fontFamily: 'monospace', fontSize: '11px',
                color: '#c9d1d9', minWidth: '60px', textAlign: 'center',
              }}>{sc.key}</kbd>
              <span style={{ color: '#8b949e' }}>{sc.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}

function ToolbarButton({ onClick, children, active }: { onClick: () => void; children: any; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#388bfd26' : '#21262d',
        border: active ? '1px solid #388bfd' : '1px solid #30363d',
        color: active ? '#58a6ff' : '#c9d1d9',
        padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
      }}
    >
      {children}
    </button>
  );
}

function SwitchVizButton() {
  const m = window.location.pathname.match(/\/api\/workflows\/([^/]+)\/codeatlas/);
  if (!m) return null;
  return (
    <ToolbarButton onClick={() => { window.location.href = '/api/workflows/' + m[1] + '/tsmorph'; }}>
      Switch to TSMorph
    </ToolbarButton>
  );
}

function FilterButton({ value, label }: { value: string | null; label: string }) {
  const current = activeFilters.value.reviewStatus;
  const isActive = current === value;

  function handleClick() {
    activeFilters.value = {
      ...activeFilters.value,
      reviewStatus: isActive ? null : value,
    };
    markDirty();
  }

  return (
    <button
      onClick={handleClick}
      style={{
        background: isActive ? '#388bfd26' : '#21262d',
        border: isActive ? '1px solid #388bfd' : '1px solid #30363d',
        color: isActive ? '#58a6ff' : '#8b949e',
        padding: '2px 8px', borderRadius: '10px', cursor: 'pointer',
        fontSize: '10px', lineHeight: '16px',
      }}
    >
      {label}
    </button>
  );
}
