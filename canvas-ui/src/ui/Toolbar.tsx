import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { JSX } from 'preact';
import { branchName, repoName, stats, forceConfig, defaultForceConfig, updateForceConfig } from '../state/graph-store';
import { zoom, setZoom, setPan, activeFilters, markDirty, layoutLocked, activeOverlays, toggleOverlay, viewMode, setViewMode, type ViewMode as ViewModeType, type Overlay } from '../state/ui-store';
import { reviewProgress } from '../state/review-store';
import { shortcuts } from './KeyboardShortcuts';
import { colors } from '../theme/tokens';

interface ToolbarProps {
  onFitAll: () => void;
}

export function Toolbar({ onFitAll }: ToolbarProps) {
  const s = stats.value;
  const progress = reviewProgress.value;
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <>
    <div style={styles.toolbar}>
      <span style={styles.brand}>
        CodeAtlas
      </span>
      {repoName.value && (
        <span style={styles.repoName}>
          {repoName.value}
        </span>
      )}
      <span style={styles.separator}>/</span>
      <span style={styles.branchLabel}>
        {branchName.value}
      </span>
      <span style={styles.filesBadge}>
        {s.totalFiles} files
      </span>
      <span style={styles.diffStats}>
        <span style={styles.additionsText}>+{s.totalAdditions}</span>
        {' '}
        <span style={styles.deletionsText}>-{s.totalDeletions}</span>
      </span>

      {progress.total > 0 && (
        <span style={styles.progressContainer}>
          <span style={styles.progressText}>
            {progress.reviewed}/{progress.total} reviewed
          </span>
          <span style={styles.progressBarContainer}>
            <span style={getProgressBarStyle(progress.reviewed, progress.total)} />
          </span>
          <span style={styles.filterButtonGroup}>
            <FilterButton value={null} label="All" />
            <FilterButton value="unreviewed" label="Unreviewed" />
            <FilterButton value="flagged" label="Flagged" />
          </span>
        </span>
      )}

      <span style={styles.verticalSeparator} />

      <span style={styles.viewModeContainer}>
        <ViewModeButton mode="diff" label="Diff" />
        <ViewModeButton mode="graph" label="Graph" />
        <ViewModeButton mode="arch" label="Arch" />
      </span>

      <span style={styles.verticalSeparator} />

      <span style={styles.overlaysContainer}>
        <span style={styles.overlaysLabel}>Overlays</span>
        <OverlayToggle overlay="risk-heatmap" label="Risk" />
      </span>

      {viewMode.value === 'graph' && <ForceConfigPanel />}

      <div style={styles.toolbarControls}>
        <ToolbarButton
          onClick={() => { layoutLocked.value = !layoutLocked.value; }}
          active={layoutLocked.value}
        >
          {layoutLocked.value ? '\uD83D\uDD12 Locked' : '\uD83D\uDD13 Unlocked'}
        </ToolbarButton>
        <span style={styles.verticalSeparatorShort} />
        <ToolbarButton onClick={() => setZoom(zoom.value * 1.2)}>+</ToolbarButton>
        <ToolbarButton onClick={() => setZoom(zoom.value * 0.8)}>-</ToolbarButton>
        <ToolbarButton onClick={onFitAll}>Fit</ToolbarButton>
        <ToolbarButton onClick={() => { setZoom(1); setPan(0, 0); }}>Reset</ToolbarButton>
      </div>
    </div>

    <div
      style={styles.helpButtonContainer}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button style={styles.helpButton}>?</button>
      {showTooltip && (
        <div style={styles.tooltipContainer}>
          <div style={styles.tooltipHeader}>
            Keyboard Shortcuts
          </div>
          {shortcuts.map(sc => (
            <div key={sc.key} style={styles.tooltipItem}>
              <kbd style={styles.tooltipKbd}>{sc.key}</kbd>
              <span style={styles.tooltipDescription}>{sc.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}

function ToolbarButton({ onClick, children, active }: { onClick: () => void; children: ComponentChildren; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={getToolbarButtonStyle(active)}
    >
      {children}
    </button>
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
      style={getFilterButtonStyle(isActive)}
    >
      {label}
    </button>
  );
}

function OverlayToggle({ overlay, label }: { overlay: Overlay; label: string }) {
  const isActive = activeOverlays.value.has(overlay);

  return (
    <button
      onClick={() => toggleOverlay(overlay)}
      style={getOverlayToggleStyle(isActive)}
    >
      <span style={getOverlayIndicatorStyle(isActive)} />
      {label}
    </button>
  );
}

function ViewModeButton({ mode, label }: { mode: ViewModeType; label: string }) {
  const isActive = viewMode.value === mode;

  return (
    <button
      onClick={() => { if (!isActive) setViewMode(mode); }}
      style={getViewModeButtonStyle(isActive)}
    >
      {label}
    </button>
  );
}

function ForceConfigPanel() {
  const cfg = forceConfig.value;
  const [open, setOpen] = useState(false);

  return (
    <div style={styles.forceConfigWrapper}>
      <button
        onClick={() => setOpen(!open)}
        style={getToolbarButtonStyle(open)}
      >
        ⚙ Force
      </button>
      {open && (
        <div style={styles.forceConfigPanel}>
          <div style={styles.forceConfigHeader}>
            <span>Force Layout</span>
            <button
              onClick={() => updateForceConfig({ ...defaultForceConfig })}
              style={styles.forceConfigReset}
            >
              Reset
            </button>
          </div>
          <ForceSlider
            label="Charge"
            value={cfg.chargeStrength}
            min={-400}
            max={0}
            step={10}
            onChange={v => updateForceConfig({ chargeStrength: v })}
          />
          <ForceSlider
            label="Link Dist"
            value={cfg.linkDistance}
            min={20}
            max={300}
            step={10}
            onChange={v => updateForceConfig({ linkDistance: v })}
          />
          <ForceSlider
            label="Gravity"
            value={cfg.gravityStrength}
            min={0}
            max={1}
            step={0.05}
            onChange={v => updateForceConfig({ gravityStrength: v })}
          />
          <ForceSlider
            label="Padding"
            value={cfg.collisionPadding}
            min={0}
            max={30}
            step={1}
            onChange={v => updateForceConfig({ collisionPadding: v })}
          />
        </div>
      )}
    </div>
  );
}

function ForceSlider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={styles.forceSliderRow}>
      <span style={styles.forceSliderLabel}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        style={styles.forceSliderInput}
      />
      <span style={styles.forceSliderValue}>{value}</span>
    </div>
  );
}

const getToolbarButtonStyle = (active?: boolean): JSX.CSSProperties => ({
  background: active ? colors.selection.activeBg : colors.bg.tertiary,
  border: active ? `1px solid ${colors.selection.activeBorder}` : `1px solid ${colors.border.default}`,
  color: active ? colors.selection.activeText : colors.text.secondary,
  padding: '4px 10px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '12px',
});

const getFilterButtonStyle = (isActive: boolean): JSX.CSSProperties => ({
  background: isActive ? colors.selection.activeBg : colors.bg.tertiary,
  border: isActive ? `1px solid ${colors.selection.activeBorder}` : `1px solid ${colors.border.default}`,
  color: isActive ? colors.selection.activeText : colors.text.tertiary,
  padding: '2px 8px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontSize: '10px',
  lineHeight: '16px',
});

const getOverlayToggleStyle = (isActive: boolean): JSX.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  background: isActive ? colors.selection.activeBg : colors.bg.canvas,
  border: isActive ? `1px solid ${colors.selection.activeBorder}` : `1px solid ${colors.border.default}`,
  borderRadius: '6px',
  padding: '4px 12px',
  cursor: 'pointer',
  fontSize: '12px',
  color: isActive ? colors.selection.activeText : colors.text.tertiary,
  fontWeight: isActive ? 600 : 400,
  transition: 'all 0.15s',
  lineHeight: '20px',
});

const getOverlayIndicatorStyle = (isActive: boolean): JSX.CSSProperties => ({
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: isActive ? colors.selection.activeText : colors.text.muted,
  transition: 'background 0.15s',
});

const getViewModeButtonStyle = (isActive: boolean): JSX.CSSProperties => ({
  background: isActive ? colors.selection.activeBg : 'transparent',
  border: isActive ? `1px solid ${colors.selection.activeBorder}` : '1px solid transparent',
  color: isActive ? colors.selection.activeText : colors.text.tertiary,
  padding: '3px 10px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: isActive ? 600 : 400,
  transition: 'all 0.15s',
});

const getProgressBarStyle = (reviewed: number, total: number): JSX.CSSProperties => ({
  display: 'block',
  height: '100%',
  borderRadius: '2px',
  background: colors.diff.addText,
  width: `${Math.round((reviewed / total) * 100)}%`,
  transition: 'width 0.2s ease',
});

const styles = {
  toolbar: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    background: colors.bg.primary,
    borderBottom: `1px solid ${colors.border.default}`,
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    color: colors.text.secondary,
    height: '44px',
  },
  brand: {
    fontWeight: 600,
    fontSize: '15px',
    color: colors.text.primary,
  },
  repoName: {
    color: colors.text.primary,
    fontFamily: 'monospace',
    fontSize: '13px',
    fontWeight: 500,
  },
  separator: {
    color: colors.text.tertiary,
  },
  branchLabel: {
    color: colors.node.changed,
    fontFamily: 'monospace',
    fontSize: '13px',
  },
  filesBadge: {
    background: colors.border.default,
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
  },
  diffStats: {
    fontSize: '12px',
  },
  additionsText: {
    color: colors.diff.addText,
  },
  deletionsText: {
    color: colors.diff.removeText,
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  progressText: {
    fontSize: '11px',
    color: colors.text.tertiary,
  },
  progressBarContainer: {
    display: 'inline-block',
    width: '80px',
    height: '4px',
    background: colors.border.default,
    borderRadius: '2px',
    overflow: 'hidden',
  },
  filterButtonGroup: {
    display: 'flex',
    gap: '2px',
  },
  verticalSeparator: {
    width: '1px',
    height: '24px',
    background: colors.border.default,
    marginLeft: '12px',
  },
  verticalSeparatorShort: {
    width: '1px',
    height: '20px',
    background: colors.border.default,
  },
  viewModeContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: colors.bg.canvas,
    borderRadius: '6px',
    padding: '2px',
  },
  overlaysContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  overlaysLabel: {
    fontSize: '11px',
    color: colors.text.tertiary,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  toolbarControls: {
    marginLeft: 'auto',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  helpButtonContainer: {
    position: 'fixed',
    bottom: '16px',
    left: '16px',
    zIndex: 100,
  },
  helpButton: {
    background: colors.bg.tertiary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: '50%',
    color: colors.text.tertiary,
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 600,
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  tooltipContainer: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: '8px',
    background: colors.bg.secondary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: '8px',
    padding: '12px 16px',
    zIndex: 200,
    whiteSpace: 'nowrap',
    boxShadow: colors.tooltip.shadow,
  },
  tooltipHeader: {
    fontSize: '12px',
    fontWeight: 600,
    color: colors.text.primary,
    marginBottom: '8px',
    borderBottom: `1px solid ${colors.border.default}`,
    paddingBottom: '6px',
  },
  tooltipItem: {
    display: 'flex',
    gap: '12px',
    padding: '3px 0',
    fontSize: '12px',
  },
  tooltipKbd: {
    background: colors.bg.tertiary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: '4px',
    padding: '1px 6px',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: colors.text.secondary,
    minWidth: '60px',
    textAlign: 'center',
  },
  tooltipDescription: {
    color: colors.text.tertiary,
  },
  forceConfigWrapper: {
    position: 'relative',
  },
  forceConfigPanel: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '8px',
    background: colors.bg.secondary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: '8px',
    padding: '12px 16px',
    zIndex: 200,
    width: '240px',
    boxShadow: colors.tooltip.shadow,
  },
  forceConfigHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
    fontWeight: 600,
    color: colors.text.primary,
    marginBottom: '10px',
    paddingBottom: '6px',
    borderBottom: `1px solid ${colors.border.default}`,
  },
  forceConfigReset: {
    background: colors.bg.tertiary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: '4px',
    padding: '2px 8px',
    fontSize: '10px',
    color: colors.text.tertiary,
    cursor: 'pointer',
  },
  forceSliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  forceSliderLabel: {
    fontSize: '11px',
    color: colors.text.tertiary,
    width: '55px',
    flexShrink: 0,
  },
  forceSliderInput: {
    flex: 1,
    height: '4px',
    accentColor: colors.selection.activeBorder,
    cursor: 'pointer',
  },
  forceSliderValue: {
    fontSize: '10px',
    color: colors.text.muted,
    width: '40px',
    textAlign: 'right',
    fontFamily: 'monospace',
  },
} as const satisfies Record<string, JSX.CSSProperties>;
