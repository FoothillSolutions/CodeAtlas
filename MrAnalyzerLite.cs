using System.Diagnostics;
using System.Text.RegularExpressions;

namespace CodeAtlas;

/// <summary>
/// Lightweight analyzer that works on any language without Roslyn.
/// Parses git diffs, builds file nodes with diff hunks, and detects
/// import-based edges via regex for Python/TypeScript/JavaScript.
/// </summary>
public class MrAnalyzerLite
{
    private readonly string _repoDir;

    public MrAnalyzerLite(string repoDir)
    {
        _repoDir = repoDir;
    }

    public async Task<MrGraph> AnalyzeAsync(string branchOrMrId)
    {
        var graph = new MrGraph();

        var diffText = await GetDiffAsync(branchOrMrId);
        if (string.IsNullOrEmpty(diffText))
        {
            Console.Error.WriteLine("No diff output. Check branch/MR ID.");
            return graph;
        }

        var diffFiles = DiffParser.Parse(diffText);
        Console.Error.WriteLine($"Found {diffFiles.Count} changed files.");

        graph.BranchName = branchOrMrId;
        graph.TotalFiles = diffFiles.Count;
        graph.TotalAdditions = diffFiles.Sum(f => f.Additions);
        graph.TotalDeletions = diffFiles.Sum(f => f.Deletions);

        // Process ALL files generically (no Roslyn)
        foreach (var diffFile in diffFiles.Where(f => !f.IsDeleted))
        {
            var fileNode = new MrFileNode
            {
                Id = SanitizeId(diffFile.Path),
                FileName = diffFile.FileName,
                FilePath = diffFile.Path,
                Additions = diffFile.Additions,
                Deletions = diffFile.Deletions,
                IsNew = diffFile.IsNew,
                IsChanged = true,
                FileType = diffFile.FileType,
                ProjectName = DetectProjectFromPath(diffFile.Path)
            };

            foreach (var hunk in diffFile.Hunks)
            {
                var section = new MrCodeSection { Header = hunk.Header };
                foreach (var line in hunk.Lines)
                {
                    section.Lines.Add(new MrCodeLine
                    {
                        LineNum = line.NewLineNum ?? line.OldLineNum ?? 0,
                        Text = line.Text,
                        DiffType = line.Type switch
                        {
                            DiffLineType.Add => "add",
                            DiffLineType.Remove => "remove",
                            _ => "context"
                        }
                    });
                }
                fileNode.Sections.Add(section);
            }

            graph.Files.Add(fileNode);
        }

        // Build import-based edges
        BuildImportEdges(graph, diffFiles);

        return graph;
    }

    /// <summary>
    /// Detects imports in Python, TypeScript, JavaScript files and creates edges
    /// between files that import each other.
    /// </summary>
    private void BuildImportEdges(MrGraph graph, List<DiffFile> diffFiles)
    {
        var fileIndex = new Dictionary<string, MrFileNode>();
        foreach (var f in graph.Files)
        {
            fileIndex[f.FilePath] = f;
            fileIndex[f.FileName] = f;
            // Also index by name without extension
            var nameNoExt = Path.GetFileNameWithoutExtension(f.FileName);
            if (!fileIndex.ContainsKey(nameNoExt))
                fileIndex[nameNoExt] = f;
        }

        var seen = new HashSet<string>();

        foreach (var diffFile in diffFiles.Where(f => !f.IsDeleted))
        {
            var imports = ExtractImports(diffFile);
            var sourceNode = graph.Files.FirstOrDefault(f => f.FilePath == diffFile.Path);
            if (sourceNode is null) continue;

            foreach (var importTarget in imports)
            {
                // Try to match import target to a changed file
                MrFileNode? target = null;

                // Try full path
                if (fileIndex.TryGetValue(importTarget, out target)) { }
                // Try filename
                else if (fileIndex.TryGetValue(Path.GetFileName(importTarget), out target)) { }
                // Try name without extension
                else if (fileIndex.TryGetValue(Path.GetFileNameWithoutExtension(importTarget), out target)) { }
                // Try last segment of module path (e.g., "foo.bar.baz" -> "baz")
                else
                {
                    var lastSegment = importTarget.Split('.', '/').Last();
                    fileIndex.TryGetValue(lastSegment, out target);
                }

                if (target is null || target.Id == sourceNode.Id) continue;

                var edgeKey = $"{sourceNode.Id}->{target.Id}";
                if (seen.Contains(edgeKey)) continue;
                seen.Add(edgeKey);

                graph.Edges.Add(new MrEdge
                {
                    FromFileId = sourceNode.Id,
                    ToFileId = target.Id,
                    InterfaceName = "imports",
                    Type = "imports"
                });
            }
        }
    }

    private static readonly Regex PythonImportFrom = new(@"^from\s+(\S+)\s+import", RegexOptions.Compiled);
    private static readonly Regex PythonImport = new(@"^import\s+(\S+)", RegexOptions.Compiled);
    private static readonly Regex TsImport = new(@"from\s+['""]([^'""]+)['""]", RegexOptions.Compiled);
    private static readonly Regex CsUsing = new(@"^using\s+(\S+)\s*;", RegexOptions.Compiled);
    private static readonly Regex RequireCall = new(@"require\(['""]([^'""]+)['""]\)", RegexOptions.Compiled);

    private List<string> ExtractImports(DiffFile file)
    {
        var imports = new List<string>();
        var allLines = file.Hunks.SelectMany(h => h.Lines).Select(l => l.Text);

        foreach (var line in allLines)
        {
            var trimmed = line.TrimStart();

            // Python: from X import ... / import X
            var m = PythonImportFrom.Match(trimmed);
            if (m.Success) { imports.Add(m.Groups[1].Value); continue; }
            m = PythonImport.Match(trimmed);
            if (m.Success) { imports.Add(m.Groups[1].Value); continue; }

            // TypeScript/JavaScript: import ... from 'X' / require('X')
            m = TsImport.Match(trimmed);
            if (m.Success && m.Groups[1].Value.StartsWith(".")) { imports.Add(m.Groups[1].Value); continue; }
            m = RequireCall.Match(trimmed);
            if (m.Success && m.Groups[1].Value.StartsWith(".")) { imports.Add(m.Groups[1].Value); continue; }

            // C#: using X;
            m = CsUsing.Match(trimmed);
            if (m.Success) { imports.Add(m.Groups[1].Value); continue; }
        }

        return imports;
    }

    private async Task<string> GetDiffAsync(string branchOrMrId)
    {
        if (branchOrMrId.StartsWith("--"))
            throw new ArgumentException($"Invalid branch/MR ID '{branchOrMrId}'", nameof(branchOrMrId));

        // Try: master...branch
        var diff = await RunGitAsync($"diff master...{branchOrMrId} --unified=3");
        if (!string.IsNullOrWhiteSpace(diff)) return diff;

        // Try: main...branch
        diff = await RunGitAsync($"diff main...{branchOrMrId} --unified=3");
        if (!string.IsNullOrWhiteSpace(diff)) return diff;

        // Try remote
        diff = await RunGitAsync($"diff master...origin/{branchOrMrId} --unified=3");
        if (!string.IsNullOrWhiteSpace(diff)) return diff;

        diff = await RunGitAsync($"diff main...origin/{branchOrMrId} --unified=3");
        if (!string.IsNullOrWhiteSpace(diff)) return diff;

        // Try direct diff
        diff = await RunGitAsync($"diff {branchOrMrId} --unified=3");
        return diff;
    }

    private Task<string> RunGitAsync(string arguments) => RunCommandAsync("git", arguments);

    private async Task<string> RunCommandAsync(string command, string arguments)
    {
        try
        {
            var psi = new ProcessStartInfo(command, arguments)
            {
                WorkingDirectory = _repoDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var process = Process.Start(psi);
            if (process is null) return "";

            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            await process.WaitForExitAsync(cts.Token);

            return await stdoutTask;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  [{command} {arguments}] failed: {ex.Message}");
            return "";
        }
    }

    private static string DetectProjectFromPath(string filePath)
    {
        var parts = filePath.Replace("\\", "/").Split('/');
        for (int i = 0; i < parts.Length - 1; i++)
        {
            var part = parts[i];
            if (part is "src" or "test" or "tests" or "lib" or "." or ".." or "") continue;
            return part;
        }
        return "root";
    }

    private static string SanitizeId(string input) => input
        .Replace("<", "_").Replace(">", "_").Replace(".", "_")
        .Replace(",", "_").Replace(" ", "_").Replace("?", "")
        .Replace("(", "").Replace(")", "").Replace("/", "_").Replace("\\", "_");
}
