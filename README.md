# CodeAtlas

An interactive visual code review tool that analyzes merge request diffs, builds dependency graphs, and renders an interactive HTML5 Canvas for navigating code changes.

**Two analysis modes:**
- **Roslyn mode** — C# repositories with a `.sln` file: resolves class/interface dependencies, constructor injection, method calls, and inheritance across projects using the Roslyn compiler platform.
- **Lite mode** — Any repository (Python, TypeScript, JavaScript, etc.): detects import-based dependencies from source files without requiring a compiler.

Output is a single self-contained HTML file you can open in any browser.

## Quick Start

```bash
# 1. Build the canvas UI (one-time)
cd canvas-ui && npm install && npm run build && cd ..

# 2. Analyze a single MR
dotnet run -- --mr 647 --repo /path/to/your-service

# 3. Or batch-process all MRs where you're a reviewer
bash run-codeatlas.sh
```

For first-time setup, see [SETUP.md](../../SETUP.md).

## Prerequisites

- **.NET 9 SDK**
- **Node.js 18+** and **npm**
- **glab CLI** authenticated (`glab auth login`)
- For Roslyn mode: a C# repository with a `.sln` file
- For Lite mode: any repository with Python/TypeScript/JavaScript source files

## Building the Canvas UI

The canvas frontend must be built before running the tool:

```bash
cd canvas-ui
npm install
npm run build
```

This produces `canvas-ui/dist/index.html` — the .NET tool embeds graph data into this template.

## Usage

### Single MR

```bash
dotnet run -- --mr <branch-or-mr-id> --repo <path-to-repo> [--target <branch>] [--sln <solution>] [--json]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--mr` | MR ID (numeric) or branch name | required |
| `--repo` | Path to the repository | required |
| `--target` | Target branch for diff comparison | `main` |
| `--sln` | Explicit path to `.sln` file | auto-detected |
| `--json` | Output JSON to stdout instead of HTML | off |

**Mode selection** is automatic: if a `.sln` file is found (or provided via `--sln`), Roslyn mode is used. Otherwise, Lite mode runs.

**Examples:**

```bash
# By MR ID (Roslyn mode — .sln auto-detected)
dotnet run -- --mr 647 --repo /path/to/csharp-service

# By branch name
dotnet run -- --mr feature/my-branch --repo /path/to/csharp-service

# Specific target branch
dotnet run -- --mr 52476 --repo /path/to/repo --target release/2.0

# Explicit solution file (when multiple .sln exist)
dotnet run -- --mr 52476 --repo /path/to/repo --sln /path/to/repo/App.sln

# Lite mode (Python/TS/JS repo — no .sln)
dotnet run -- --mr 123 --repo /path/to/python-service

# JSON output for debugging
dotnet run -- --mr 647 --repo /path/to/your-service --json
```

Output is written to `output-codeatlas/<mr-id>.html`.

### Batch Mode

From this directory (`tools/CodeAtlas`):

```bash
# Process all MRs where you're a reviewer
bash run-codeatlas.sh

# Specify a GitLab group (overrides config)
bash run-codeatlas.sh --group=myorg/mygroup

# Start the AI chat proxy alongside analysis
bash run-codeatlas.sh --with-chat
```

| Flag | Description |
|------|-------------|
| `--with-chat` | Start `codeatlas-chat-proxy.py` on port 7823 before processing |
| `--group=<group>` | GitLab group to query (overrides `gitlab_group` in config) |

The batch script:
- Queries `glab mr list` for MRs where you're assigned as reviewer
- Maps repo names to local paths using `repos_parent_dir` from `codeatlas-config.json`
- Skips MRs whose output HTML is newer than the MR's `updated_at` timestamp
- Skips repos not cloned locally
- Applies `repo_overrides` for custom `.sln` paths

## Configuration

### CodeAtlas Config (`codeatlas-config.json`)

Copy from `codeatlas-config.example.json`:

```json
{
  "repos_parent_dir": "/path/to/parent/folder/containing/all/repos",
  "gitlab_group": "myorg/mygroup",
  "repo_overrides": {
    "some-monorepo": {
      "sln": "/path/to/monorepo/SubDir/Solution.sln"
    }
  }
}
```

| Key | Description |
|-----|-------------|
| `repos_parent_dir` | Parent directory containing all cloned repos as direct children |
| `gitlab_group` | GitLab group for batch MR queries (can be overridden with `--group=`) |
| `repo_overrides` | Per-repo settings — currently supports `sln` for explicit solution file paths |

### Per-Repo Layout Config (`.codeatlas.json`)

Place in any repo root to customize the canvas layout:

```json
{
  "nodeWidth": 520,
  "rankDirection": "LR",
  "defaultZoom": 0.8
}
```

| Key | Description | Default |
|-----|-------------|---------|
| `nodeWidth` | Card width in pixels | 520 |
| `rankDirection` | `LR` (left-to-right) or `TB` (top-to-bottom) | `TB` |
| `defaultZoom` | Initial zoom level | 1.0 |

## Canvas Features

### Navigation
- **Pan** — drag empty space
- **Zoom** — mouse wheel (zooms toward cursor)
- **Fit All / Reset** — toolbar buttons or `0` key

### Code Cards
- Each changed file renders as a card with diff-highlighted code (green = additions, red = deletions)
- Border colors: blue = changed, green = new, gray = unchanged dependency
- Click to select, double-click or `Enter` to expand into full code viewer
- Expanded viewer has collapsible diff sections, `Tab` / `Shift+Tab` to navigate between files

### Dependency Edges
- **Roslyn mode**: arrows show interface implementations, constructor injection, method calls, inheritance
- **Lite mode**: arrows show import/require relationships between files
- Hover an edge for a tooltip with dependency details
- Selecting a node dims unrelated nodes/edges to highlight the dependency chain

### Overlays

Stackable visual layers toggled via toolbar or keyboard:

- **Risk Heatmap** (`h`) — colors nodes by risk score:
  ```
  risk = (additions + deletions) × (fanOut + fanIn + 1) × (isNew ? 2 : 1)
  ```
  - Critical (≥ 90th percentile) — red
  - High (≥ 75th) — amber
  - Medium (≥ 50th) — blue tint
  - Low (< 50th) — unchanged

- **Critical Paths** (`i`) — thickens borders based on impact radius (transitive dependency count via BFS)

Both overlays can be active simultaneously.

### Level of Detail (Semantic Zoom)
- **Full** — complete code card with diff preview
- **Glyph** — compact card showing class name + diff stats
- **Dot** — minimal dot representation at far zoom
- Auto-switches based on zoom level, or cycle manually with `s` key
- Font scales inversely with zoom for readability

### Review Tracking
- Mark files as **Reviewed** (`r`), **Flagged** (`f`), or **Unreviewed** (`u`)
- Also supports **Needs Attention** status (cycle with click)
- Progress bar shows review completion
- State persisted per-branch in `localStorage`
- Filter canvas by review status via toolbar

### AI Chat Panel
- Toggle with `a` key or toolbar button
- Sends the current graph context (files, diffs, dependencies) to Claude via the local chat proxy
- Requires `codeatlas-chat-proxy.py` running on port 7823 (auto-started with `--with-chat`)

### Search
- `/` or toolbar search to filter nodes by filename
- Matching nodes highlighted, non-matching dimmed

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Select next / previous file |
| `Enter` | Expand selected node |
| `Escape` | Close expanded view / search / help |
| `+` / `-` | Zoom in / out |
| `0` | Fit all nodes in view |
| `r` / `f` / `u` | Mark reviewed / flagged / unreviewed |
| `s` | Cycle LOD mode: auto → glyph → full |
| `h` | Toggle risk heatmap |
| `i` | Toggle critical paths |
| `a` | Toggle AI chat panel |
| Arrow keys | Pan canvas |
| `?` | Show shortcuts overlay |

## Architecture

```
CodeAtlas/
├── Program.cs                  # 3-line entry point
├── CliRunner.cs                # CLI argument parsing and orchestration
├── Defaults.cs                 # Shared constants (timeouts, defaults)
├── GitCommandRunner.cs         # Shared git/CLI command execution
├── MrAnalyzer.cs               # Roslyn analysis: loads .sln, resolves dependencies
├── MrAnalyzerLite.cs           # Lite analysis: import-based edges (no compiler)
├── ImportEdgeBuilder.cs        # Import/require edge detection (Python, TS, JS)
├── DiffParser.cs               # Git diff → structured sections
├── GraphHelpers.cs             # Shared utilities (file type detection, naming)
├── MrGraph.cs                  # Data models (MrGraph, MrFileNode, MrEdge, etc.)
├── MrHtmlRenderer.cs           # Embeds JSON graph data into canvas-ui HTML
├── WorktreeHelper.cs           # Git worktree management for MR branch checkout
├── CodeAtlas.csproj            # .NET 9 project
├── run-codeatlas.sh            # Batch runner for all reviewer MRs
├── codeatlas-chat-proxy.py     # HTTP proxy (port 7823) forwarding to Claude CLI
├── codeatlas-config.json       # Local config (git-ignored)
├── codeatlas-config.example.json
├── output-codeatlas/           # Generated HTML files (git-ignored)
└── canvas-ui/                  # Preact + TypeScript frontend
    ├── src/
    │   ├── main.tsx            # Entry point, graph initialization, ErrorBoundary
    │   ├── types.ts            # Shared TypeScript types (MrGraph, MrFileNode, etc.)
    │   ├── theme/
    │   │   └── tokens.ts       # Design tokens (colors, spacing)
    │   ├── state/              # @preact/signals-based state management
    │   │   ├── graph-store.ts  # Graph data, node positions, edges
    │   │   ├── ui-store.ts     # Zoom, pan, selection, overlays, filters, LOD
    │   │   ├── review-store.ts # Review status tracking (localStorage-persisted)
    │   │   ├── analysis-store.ts # Risk score computation
    │   │   └── chat-store.ts   # Chat panel state
    │   ├── canvas/             # Canvas rendering pipeline
    │   │   ├── canvas-renderer.ts  # Main render loop (reactive via signals)
    │   │   ├── node-painter.ts     # File card rendering (full + compact)
    │   │   ├── arrow-painter.ts    # Dependency edge rendering
    │   │   ├── project-painter.ts  # Project group backgrounds
    │   │   ├── label-painter.ts    # Text label rendering utilities
    │   │   ├── lod-fade-manager.ts # Level-of-detail transition animations
    │   │   └── interaction.ts      # Mouse/touch input handling
    │   ├── layout/             # Graph layout algorithms
    │   │   ├── dagre-layout.ts # Dagre-based hierarchical layout
    │   │   ├── arch-layout.ts  # Architecture view layout
    │   │   └── arrow-router.ts # Edge routing between nodes
    │   ├── ui/                 # Preact UI components
    │   │   ├── App.tsx         # Root application component
    │   │   ├── Toolbar.tsx     # Top toolbar (zoom, filters, overlays)
    │   │   ├── CodeCard.tsx    # Expanded code viewer
    │   │   ├── CodeLine.tsx    # Single line renderer with syntax highlighting
    │   │   ├── CardOverlay.tsx # Card action overlay (review status)
    │   │   ├── EdgeTooltip.tsx # Dependency edge tooltip
    │   │   ├── ChatPanel.tsx   # AI chat panel
    │   │   ├── ErrorBoundary.tsx   # Error boundary wrapper
    │   │   └── KeyboardShortcuts.tsx # Keyboard handler + help overlay
    │   ├── syntax/
    │   │   └── highlighter.ts  # Syntax highlighting engine
    │   └── utils/
    │       ├── diff-utils.ts   # Diff parsing utilities
    │       └── chat-context.ts # Chat context builder
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts          # Vite config (single-file HTML output via inlining)
```

### Data Flow

1. **`Program.cs`** → delegates to `CliRunner` which parses CLI arguments
2. **`CliRunner`** → creates a git worktree for the MR branch via `WorktreeHelper`
3. **`MrAnalyzer`** (Roslyn) or **`MrAnalyzerLite`** (import-based) → diffs against target branch, builds `MrGraph` containing files and dependency edges
4. **`MrHtmlRenderer`** → serializes `MrGraph` to JSON, embeds into `canvas-ui/dist/index.html`
5. **Browser** → `main.tsx` reads embedded JSON, runs dagre layout, starts reactive canvas render loop

### Analysis Modes

**Roslyn mode** (C# repos with `.sln`):
- Loads the solution via `Microsoft.CodeAnalysis`
- Walks syntax trees to find class declarations, interface implementations, constructor parameters, method calls
- Resolves cross-project references through the Roslyn compilation model
- Produces typed edges: `implements`, `injects`, `calls`, `inherits`

**Lite mode** (all other repos):
- Scans changed files for `import`/`require`/`from` statements
- Resolves relative paths to match other changed files
- Supports Python, TypeScript, and JavaScript
- Produces `imports` edges

## Chat Proxy

The `codeatlas-chat-proxy.py` script runs a local HTTP server on port 7823 that bridges the canvas UI's chat panel to the Claude CLI:

```bash
# Start manually
python3 codeatlas-chat-proxy.py

# Or auto-start via batch mode
bash run-codeatlas.sh --with-chat
```

The proxy accepts POST requests with the graph context and user message, forwards to `claude` CLI, and streams the response back.

## Development

### Frontend Dev Server

```bash
cd canvas-ui
npm run dev
```

Starts Vite dev server with hot reload. Note: graph data comes from the embedded JSON, so you'll need a previously generated HTML file's data for testing.

### Building

```bash
# Backend
dotnet build

# Frontend
cd canvas-ui && npm run build
```

The Vite build produces a single inlined HTML file (all JS/CSS bundled inline) so the output is fully self-contained.
