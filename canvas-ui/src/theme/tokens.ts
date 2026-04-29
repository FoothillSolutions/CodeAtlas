/**
 * Central theme token file.
 * ALL colors, fonts, and spacing used in the canvas and UI components
 * are defined here. No color literals should exist in renderers.
 */

// ── Colors ──────────────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bg: {
    canvas: '#0d1117',
    primary: '#161b22',
    secondary: '#1c2128',
    tertiary: '#21262d',
    overlay: 'rgba(0, 0, 0, 0.5)',
    overlayDark: 'rgba(0, 0, 0, 0.7)',
  },

  // Borders
  border: {
    default: '#30363d',
    subtle: '#21262d',
  },

  // Text
  text: {
    primary: '#f0f6fc',
    secondary: '#c9d1d9',
    tertiary: '#8b949e',
    muted: '#484f58',
    faint: '#6e7681',
  },

  // Node borders by change state
  node: {
    changed: '#58a6ff',
    new: '#3fb950',
    ghost: '#30363d',
  },

  // Diff highlighting
  diff: {
    addBg: 'rgba(46, 160, 67, 0.20)',
    removeBg: 'rgba(248, 81, 73, 0.20)',
    addBgSubtle: 'rgba(46, 160, 67, 0.12)',
    removeBgSubtle: 'rgba(248, 81, 73, 0.12)',
    addText: '#3fb950',
    removeText: '#f85149',
    gutterAddBg: 'rgba(46, 160, 67, 0.30)',
    gutterRemoveBg: 'rgba(248, 81, 73, 0.30)',
    addStripe: '#3fb950',
    removeStripe: '#f85149',
  },

  // Review status
  review: {
    reviewed: '#3fb950',
    flagged: '#f85149',
    'needs-attention': '#d29922',
    reviewedBg: '#238636',
    flaggedBg: '#da3633',
    attentionBg: '#9e6a03',
    riskBadgeBg: '#58181c',
  },

  // Selection / hover glow
  selection: {
    glow: 'rgba(56, 132, 244, 0.3)',
    hoverGlow: 'rgba(56, 132, 244, 0.15)',
    activeBg: '#388bfd26',
    activeBorder: '#388bfd',
    activeText: '#58a6ff',
  },

  // Edge / arrow colors
  edge: {
    di: { stroke: '#58a6ff', alpha: 0.6 },
    calls: { stroke: '#3fb950', alpha: 0.6 },
    ghost: { stroke: '#484f58', alpha: 0.3 },
    label: '#8b949e',
  },

  // Risk overlay
  risk: {
    criticalFill: 'rgba(248, 81, 73, 0.12)',
    highFill: 'rgba(210, 153, 34, 0.10)',
    mediumFill: 'rgba(56, 139, 253, 0.08)',
    criticalBorder: '#f85149',
    highBorder: '#d29922',
    mediumBorder: '#388bfd',
  },

  // Container (project group)
  container: {
    fill: 'rgba(48, 54, 61, 0.2)',
    stroke: '#30363d',
    label: '#8b949e',
  },

  // Tooltip / popover
  tooltip: {
    bg: '#1c2128',
    border: '#30363d',
    shadow: '0 8px 24px rgba(0,0,0,0.6)',
    interfaceName: '#79c0ff',
    methodCall: '#7ee787',
  },

  // Badge
  badge: {
    newBg: '#238636',
    newText: '#fff',
    unchangedBg: '#30363d',
    unchangedText: '#8b949e',
  },

  // Architecture view
  arch: {
    nodeFill: '#1c2128',
    nodeStroke: '#58a6ff',
    nodeHeaderFill: '#161b22',
    expandedStroke: '#3fb950',
    statsAdd: '#3fb950',
    edgeStroke: '#58a6ff',
    edgeAlpha: 0.5,
  },

  // Glyph palette (LOD tier)
  glyph: {
    import: '#79c0ff',    // blue - imports/using
    class: '#d2a8ff',     // purple - class/interface declarations
    method: '#7ee787',    // green - methods/functions
    property: '#ffa657',  // orange - properties/fields
    comment: '#484f58',   // dim gray - comments
    other: '#8b949e',     // gray - everything else
    diffOverlay: 'rgba(56, 132, 244, 0.25)', // highlight for changed sections
  },

  // LOD dot tier
  dot: {
    new: '#3fb950',
    changed: '#58a6ff',
    unchanged: '#484f58',
  },
} as const;

// ── Fonts ───────────────────────────────────────────────────────

export const fonts = {
  mono: '"SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
  ui: '"Segoe UI", system-ui, sans-serif',
} as const;

// ── Spacing & Dimensions ────────────────────────────────────────

export const dimensions = {
  // Node card
  headerHeight: 36,
  lineHeight: 18,
  gutterWidth: 52,
  maxPreviewLines: 25,
  borderRadius: 8,
  padding: 8,

  // Arrow
  arrowHeadSize: 8,
  cornerRadius: 6,

  // Container
  groupPadding: 30,
  groupLabelHeight: 28,

  // Layout
  intraNodesep: 60,
  intraRanksep: 100,
  intraEdgesep: 20,
  interNodesep: 100,
  interRanksep: 300,
  interMargin: 60,
  containerMinGap: 40,

  // Toolbar
  toolbarHeight: 44,

  // Hit testing
  edgeHitThreshold: 8,

  // LOD thresholds (zoom levels)
  lodDotThreshold: 0.15,   // below this: dot tier
  lodGlyphThreshold: 0.35, // below this: glyph tier, above: full tier
} as const;

// ── Derived helpers ─────────────────────────────────────────────

export const fontStrings = {
  mono11: `11px ${fonts.mono}`,
  mono12bold: `bold 12px ${fonts.mono}`,
  ui10: `10px ${fonts.ui}`,
  ui11: `11px ${fonts.ui}`,
  ui12: `12px ${fonts.ui}`,
  ui12bold: `bold 12px ${fonts.ui}`,
  ui13: `13px ${fonts.ui}`,
  ui13bold: `bold 13px ${fonts.ui}`,
  ui14bold: `bold 14px ${fonts.ui}`,
  ui16bold: `bold 16px ${fonts.ui}`,
} as const;
