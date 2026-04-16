# CodeAtlas

## Context
Git diff/MR visualizer that analyzes changed files, extracts dependency relationships, and renders an interactive dagre-layout graph as a self-contained HTML file. Originally built for C# projects using Roslyn semantic analysis, now supports **any language** via the `MrAnalyzerLite` diff-only mode. The canvas-ui frontend uses Preact + signals with custom Canvas2D rendering.

## Branches
- `code-atlas-csharp` — Original C#-only version (production)
- `feat/multi-language` — Multi-language support with MrAnalyzerLite (current work)

## Tooling
- Runtime: .NET 9.0 (C# backend)
- C# analysis: Roslyn (Microsoft.CodeAnalysis) — extracts DI dependencies, method calls
- Diff parsing: Custom `DiffParser.cs` — language-agnostic unified diff parser
- Frontend: Preact 10 + @preact/signals + @dagrejs/dagre (canvas-ui/)
- Bundler: Vite with vite-plugin-singlefile (outputs single HTML file)
- Syntax highlighting: Custom regex-based tokenizers (highlighter.ts)

## Key Commands
```bash
# C# mode (with Roslyn analysis)
dotnet run -- --mr <branch> --repo <path>

# Multi-language mode (no Roslyn, works on any project)
dotnet run -- --mr <branch> --repo <path> --no-roslyn

# JSON output
dotnet run -- --mr <branch> --repo <path> --json

# Build canvas-ui frontend
cd canvas-ui && npm run build
```

## Project Structure
### C# Backend
- `Program.cs` — Entry point, CLI argument parsing, .sln detection, mode selection (Roslyn vs diff-only)
- `MrAnalyzer.cs` — Full Roslyn analyzer: DI extraction, method calls, cross-file edges, ghost nodes
- `MrAnalyzerLite.cs` — **NEW**: Lightweight analyzer for any language. Regex-based import detection for Python/TypeScript/JavaScript/C#. No Roslyn dependency
- `DiffParser.cs` — Unified diff parser (git diff output → structured DiffFile/DiffHunk/DiffLine). Includes `FileType` property for language detection
- `MrHtmlRenderer.cs` — Reads canvas-ui dist/index.html, injects graph JSON, outputs self-contained HTML
- `CodeAtlas.csproj` — .NET project file with Roslyn NuGet dependencies

### Canvas UI Frontend (canvas-ui/)
- `src/ui/App.tsx` — Main Preact component, canvas setup, layout orchestration
- `src/ui/Toolbar.tsx` — Top bar: branch name, stats, zoom controls, lock, semantic zoom toggle, **Switch to TSMorph** button
- `src/ui/CodeCard.tsx` — File viewer with diff sections, review status marking
- `src/ui/EdgeTooltip.tsx` — Hover tooltips on dependency edges
- `src/ui/KeyboardShortcuts.tsx` — Keyboard navigation
- `src/syntax/highlighter.ts` — Multi-language syntax highlighting (C#, Python, TypeScript, JavaScript, JSON, YAML, SQL, XML, CSS, TOML)
- `src/layout/dagre-layout.ts` — Dagre graph layout engine
- `src/state/graph-store.ts` — Signal-based graph data store
- `src/state/ui-store.ts` — UI state (zoom, pan, filters, semantic zoom)
- `src/state/review-store.ts` — Code review progress tracking
- `src/canvas/` — Canvas rendering primitives
- `dist/index.html` — Built single-file bundle (must be committed for MrHtmlRenderer to use)

## Data Models (in MrAnalyzer.cs)
```
MrGraph
├── BranchName, TotalFiles, TotalAdditions, TotalDeletions
├── Config (CanvasConfig: zoom, nodeWidth, rankDirection, maxVisibleLines)
├── Files[] (MrFileNode)
│   ├── Id, FileName, FilePath, Additions, Deletions
│   ├── IsNew, IsChanged, FileType, ProjectName
│   ├── Sections[] (MrCodeSection → MrCodeLine[])
│   ├── Dependencies[] (C# DI — InterfaceName, ParamName)
│   └── MethodCalls[] (C# — FromMethod, TargetInterface, CalledMethod)
└── Edges[] (MrEdge)
    ├── FromFileId, ToFileId, InterfaceName, ParamName
    ├── Type: "di" | "calls" | "di-ghost" | "imports"
    └── MethodCalls[]
```

## Multi-Language Support (feat/multi-language)
### What Changed
1. **Program.cs**: `.sln` is now optional. If not found, auto-switches to `MrAnalyzerLite` (diff-only mode). `--no-roslyn` flag for explicit control
2. **MrAnalyzerLite.cs**: New file — processes all changed files generically with regex-based import detection:
   - Python: `from X import` / `import X`
   - TypeScript/JavaScript: `import ... from 'X'` / `require('X')`
   - C#: `using X;`
   - Matches imports to other changed files to create edges
3. **DiffParser.cs**: Added `FileType` property — maps extensions to language names (python, typescript, javascript, json, yaml, toml, etc.)
4. **highlighter.ts**: Added tokenizers for Python (keywords, decorators, types), TypeScript (extends JS with type keywords), TOML/config files
5. **Toolbar.tsx**: "Switch to TSMorph" button — only visible when served from ADW dashboard (`/api/workflows/{id}/codeatlas` URL pattern)

### How Modes Work
- **Roslyn mode** (default when .sln found): Full C# semantic analysis — DI dependencies, method calls, cross-file resolution, ghost nodes for unchanged dependencies
- **Diff-only mode** (no .sln or `--no-roslyn`): Works on any language. Parses git diff, creates file nodes with diff sections, detects imports via regex. No semantic analysis but shows all changed files with syntax-highlighted diffs

## Canvas Config (`.codeatlas.json`)
Place in repo root:
```json
{
  "defaultZoom": 1.0,
  "nodeWidth": 520,
  "rankDirection": "LR",
  "maxVisibleLines": 25
}
```

## Dashboard Integration (agent_playground)
- Backend endpoint: `/api/workflows/{id}/codeatlas` in `visualizers.py`
- Uses `--no-roslyn` flag for non-C# repos
- Switch button in Toolbar.tsx navigates to `/api/workflows/{id}/tsmorph`
- Counterpart: TSMorphGraph has "Switch to CodeAtlas" button

## Development Guidelines
1. **Always rebuild canvas-ui** after frontend changes: `cd canvas-ui && npm run build`
2. **Commit dist/index.html** — MrHtmlRenderer reads this built file at runtime
3. The `createTokenizer` factory in highlighter.ts takes a regex pattern + classifier function — use it for new language tokenizers
4. MrAnalyzerLite tries multiple git diff bases: `master...branch`, `main...branch`, `origin/branch`, direct diff — handles various repo setups
5. DiffParser is fully language-agnostic — only `IsCSharp` property is C#-specific (kept for backward compat)
