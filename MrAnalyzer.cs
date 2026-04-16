using System.Diagnostics;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CodeAtlas;

/// <summary>
/// Analyzes an MR: gets the diff, finds changed .cs files, runs Roslyn analysis,
/// and builds a graph with diff annotations.
/// </summary>
public class MrAnalyzer
{
    private readonly Solution _solution;
    private readonly string _solutionDir;

    public MrAnalyzer(Solution solution, string solutionPath)
    {
        _solution = solution;
        _solutionDir = Path.GetDirectoryName(solutionPath)
            ?? throw new ArgumentException("Invalid solution path", nameof(solutionPath));
    }

    public async Task<MrGraph> AnalyzeAsync(string branchOrMrId)
    {
        var graph = new MrGraph();

        // Get the diff
        var diffText = await GetDiffAsync(branchOrMrId);
        if (string.IsNullOrEmpty(diffText))
        {
            Console.Error.WriteLine("No diff output. Check branch/MR ID.");
            return graph;
        }

        var diffFiles = DiffParser.Parse(diffText);
        var csFiles = diffFiles.Where(f => f.IsCSharp && !f.IsDeleted).ToList();
        Console.Error.WriteLine($"Found {diffFiles.Count} changed files, {csFiles.Count} are .cs files.");

        graph.BranchName = branchOrMrId;
        graph.TotalFiles = diffFiles.Count;
        graph.TotalAdditions = diffFiles.Sum(f => f.Additions);
        graph.TotalDeletions = diffFiles.Sum(f => f.Deletions);

        // Analyze each changed .cs file
        foreach (var diffFile in csFiles)
        {
            var doc = FindDocument(diffFile.Path);
            if (doc is null)
            {
                Console.Error.WriteLine($"  Skipping {diffFile.Path} (not found in solution)");
                continue;
            }

            Console.Error.WriteLine($"  Analyzing {diffFile.Path} (+{diffFile.Additions}/-{diffFile.Deletions})");
            await AnalyzeChangedFile(doc, diffFile, graph);
        }

        // Analyze non-C# files (diff hunks only, no Roslyn analysis)
        var nonCsFiles = diffFiles.Where(f => !f.IsCSharp && !f.IsDeleted).ToList();
        Console.Error.WriteLine($"  Processing {nonCsFiles.Count} non-C# files.");
        foreach (var diffFile in nonCsFiles)
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
                FileType = DetectFileType(diffFile.Path),
                ProjectName = DetectProjectFromPath(diffFile.Path)
            };

            // Build sections from diff hunks (same as C# files, just no Roslyn analysis)
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

        // Build cross-file edges
        await BuildCrossFileEdgesAsync(graph);

        return graph;
    }

    private async Task<string> GetDiffAsync(string branchOrMrId)
    {
        // Guard against argument injection: reject flag-like values
        if (branchOrMrId.StartsWith("--"))
            throw new ArgumentException($"Invalid branch/MR ID '{branchOrMrId}': must not start with '--'.", nameof(branchOrMrId));

        // Try git diff first (local branch)
        var diff = await RunGitAsync($"diff main...{branchOrMrId} --unified=3");
        if (!string.IsNullOrWhiteSpace(diff)) return diff;

        // Try remote branch (common when running against a different repo)
        Console.Error.WriteLine("  Local branch not found, trying origin/...");
        await RunGitAsync("fetch origin");
        diff = await RunGitAsync($"diff main...origin/{branchOrMrId} --unified=3");
        if (!string.IsNullOrWhiteSpace(diff)) return diff;

        // Try as MR number via glab
        Console.Error.WriteLine("  Trying glab mr diff...");
        diff = await RunCommandAsync("glab", $"mr diff {branchOrMrId}");
        if (!string.IsNullOrWhiteSpace(diff)) return diff;

        // Try git diff against HEAD
        diff = await RunGitAsync($"diff {branchOrMrId} --unified=3");
        return diff;
    }

    private async Task AnalyzeChangedFile(Document doc, DiffFile diffFile, MrGraph graph)
    {
        var tree = await doc.GetSyntaxTreeAsync();
        var model = await doc.GetSemanticModelAsync();
        if (tree is null || model is null) return;

        var root = await tree.GetRootAsync();
        var classes = root.DescendantNodes().OfType<ClassDeclarationSyntax>().ToList();

        // Build changed ranges in new-file coordinates.
        // For deletion-only hunks, we use the surrounding context lines' new-line numbers
        // to approximate where in the new file the deletion occurred.
        var addedLines = new HashSet<int>();
        var changedRanges = new List<(int Start, int End)>();
        foreach (var hunk in diffFile.Hunks)
        {
            var hasActualChange = hunk.Lines.Any(l => l.Type is DiffLineType.Add or DiffLineType.Remove);
            if (!hasActualChange) continue;

            foreach (var line in hunk.Lines)
            {
                if (line.Type == DiffLineType.Add && line.NewLineNum.HasValue)
                    addedLines.Add(line.NewLineNum.Value);
            }

            // Compute the new-file span of this hunk using all lines that have a new-file number
            var newLineNums = hunk.Lines
                .Where(l => l.NewLineNum.HasValue)
                .Select(l => l.NewLineNum!.Value)
                .ToList();
            if (newLineNums.Count > 0)
                changedRanges.Add((newLineNums.Min(), newLineNums.Max()));
        }

        // Create the file node with diff-annotated sections
        var fileNode = new MrFileNode
        {
            Id = SanitizeId(diffFile.Path),
            FileName = diffFile.FileName,
            FilePath = diffFile.Path,
            Additions = diffFile.Additions,
            Deletions = diffFile.Deletions,
            IsNew = diffFile.IsNew,
            IsChanged = true,
            FileType = "csharp",
            ProjectName = doc.Project.Name
        };

        // Build sections from diff hunks with surrounding context
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

        // Roslyn analysis: find DI dependencies and method calls for each class in the file
        foreach (var classSyntax in classes)
        {
            var classSymbol = model.GetDeclaredSymbol(classSyntax);
            if (classSymbol is null) continue;

            // Constructor DI params
            var ctorParams = GetConstructorParams(classSyntax, model);
            foreach (var (ifaceName, paramName) in ctorParams)
            {
                fileNode.Dependencies.Add(new MrDependency
                {
                    InterfaceName = ifaceName,
                    ParamName = paramName
                });
            }

            // Method calls to injected services
            foreach (var method in classSyntax.Members.OfType<MethodDeclarationSyntax>())
            {
                var methodSpan = method.GetLocation().GetLineSpan();
                var methodStart = methodSpan.StartLinePosition.Line + 1;
                var methodEnd = methodSpan.EndLinePosition.Line + 1;

                // Check if this method has changed lines (additions or deletion-only hunks)
                var hasChanges = addedLines.Any(ln => ln >= methodStart && ln <= methodEnd)
                    || changedRanges.Any(r => r.Start <= methodEnd && r.End >= methodStart);

                if (!hasChanges) continue;

                var calls = GetMethodCalls(method, model);
                foreach (var (targetInterface, calledMethod) in calls)
                {
                    fileNode.MethodCalls.Add(new MrMethodCall
                    {
                        FromMethod = method.Identifier.Text,
                        TargetInterface = targetInterface,
                        CalledMethod = calledMethod,
                        IsInChangedCode = true
                    });
                }
            }
        }

        graph.Files.Add(fileNode);
    }

    private async Task BuildCrossFileEdgesAsync(MrGraph graph)
    {
        // For each file's dependencies, check if the implementation is also a changed file
        var filesByClass = new Dictionary<string, MrFileNode>();
        foreach (var file in graph.Files)
        {
            // Use filename without extension as approximate class name
            var className = Path.GetFileNameWithoutExtension(file.FileName);
            filesByClass[className] = file;
        }

        foreach (var file in graph.Files)
        {
            foreach (var dep in file.Dependencies)
            {
                // Try to find the implementation file among changed files
                // Interface IFoo -> implementation might be Foo or FooService
                var ifaceName = dep.InterfaceName;
                var implName = ifaceName.StartsWith("I") ? ifaceName[1..] : ifaceName;

                // Check if any changed file matches
                var target = graph.Files.FirstOrDefault(f =>
                    f.FileName.Contains(implName, StringComparison.OrdinalIgnoreCase) &&
                    f.Id != file.Id);

                if (target is not null)
                {
                    graph.Edges.Add(new MrEdge
                    {
                        FromFileId = file.Id,
                        ToFileId = target.Id,
                        InterfaceName = dep.InterfaceName,
                        ParamName = dep.ParamName,
                        Type = "di"
                    });
                }
            }

            // Also link via method calls
            foreach (var call in file.MethodCalls)
            {
                var implName = call.TargetInterface.StartsWith("I") ? call.TargetInterface[1..] : call.TargetInterface;
                var target = graph.Files.FirstOrDefault(f =>
                    f.FileName.Contains(implName, StringComparison.OrdinalIgnoreCase) &&
                    f.Id != file.Id);

                if (target is not null)
                {
                    var existing = graph.Edges.FirstOrDefault(e =>
                        e.FromFileId == file.Id && e.ToFileId == target.Id);
                    if (existing is not null)
                    {
                        if (!existing.MethodCalls.Contains($"{call.FromMethod}() -> {call.CalledMethod}()"))
                            existing.MethodCalls.Add($"{call.FromMethod}() -> {call.CalledMethod}()");
                    }
                    else
                    {
                        var edge = new MrEdge
                        {
                            FromFileId = file.Id,
                            ToFileId = target.Id,
                            InterfaceName = call.TargetInterface,
                            Type = "calls"
                        };
                        edge.MethodCalls.Add($"{call.FromMethod}() -> {call.CalledMethod}()");
                        graph.Edges.Add(edge);
                    }
                }
            }
        }

        // Also try Roslyn-based cross-file resolution for unchanged files that are dependencies
        await ResolveDependenciesToUnchangedFilesAsync(graph);
    }

    private async Task ResolveDependenciesToUnchangedFilesAsync(MrGraph graph)
    {
        var changedFileIds = graph.Files.Select(f => f.Id).ToHashSet();

        // Pre-compute all compilations once — avoids repeated blocking .Result calls in nested loops
        var compilations = await Task.WhenAll(
            _solution.Projects.Select(async p => (Project: p, Compilation: await p.GetCompilationAsync()))
        );

        foreach (var file in graph.Files.ToList())
        {
            foreach (var dep in file.Dependencies)
            {
                // Skip if already resolved
                if (graph.Edges.Any(e => e.FromFileId == file.Id && e.InterfaceName == dep.InterfaceName))
                    continue;

                // Search the solution for the implementation
                var implName = dep.InterfaceName.StartsWith("I") ? dep.InterfaceName[1..] : dep.InterfaceName;

                foreach (var (project, compilation) in compilations)
                {
                    if (compilation is null) continue;

                    foreach (var syntaxTree in compilation.SyntaxTrees)
                    {
                        if (syntaxTree.FilePath is null) continue;
                        var relativePath = Path.GetRelativePath(_solutionDir, syntaxTree.FilePath);
                        var fileName = Path.GetFileName(syntaxTree.FilePath);

                        if (!fileName.Contains(implName, StringComparison.OrdinalIgnoreCase)) continue;

                        var ghostId = SanitizeId(relativePath);
                        if (changedFileIds.Contains(ghostId)) continue;

                        // Add as ghost node (unchanged but connected)
                        if (!graph.Files.Any(f => f.Id == ghostId))
                        {
                            graph.Files.Add(new MrFileNode
                            {
                                Id = ghostId,
                                FileName = fileName,
                                FilePath = relativePath,
                                IsChanged = false,
                                FileType = DetectFileType(relativePath),
                                ProjectName = project.Name
                            });
                        }

                        graph.Edges.Add(new MrEdge
                        {
                            FromFileId = file.Id,
                            ToFileId = ghostId,
                            InterfaceName = dep.InterfaceName,
                            ParamName = dep.ParamName,
                            Type = "di-ghost"
                        });
                        break;
                    }
                    if (graph.Edges.Any(e => e.FromFileId == file.Id && e.InterfaceName == dep.InterfaceName))
                        break;
                }
            }
        }
    }

    private List<(string InterfaceName, string ParamName)> GetConstructorParams(ClassDeclarationSyntax cls, SemanticModel model)
    {
        var result = new List<(string, string)>();

        // Primary constructor
        if (cls.ParameterList is not null)
        {
            foreach (var param in cls.ParameterList.Parameters)
            {
                if (param.Type is null) continue;
                var typeInfo = model.GetTypeInfo(param.Type);
                if (typeInfo.Type?.TypeKind == TypeKind.Interface)
                {
                    result.Add((typeInfo.Type.Name, param.Identifier.Text));
                }
            }
        }

        // Traditional constructors
        foreach (var ctor in cls.Members.OfType<ConstructorDeclarationSyntax>())
        {
            if (ctor.ParameterList is null) continue;
            foreach (var param in ctor.ParameterList.Parameters)
            {
                if (param.Type is null) continue;
                var typeInfo = model.GetTypeInfo(param.Type);
                if (typeInfo.Type?.TypeKind == TypeKind.Interface)
                {
                    result.Add((typeInfo.Type.Name, param.Identifier.Text));
                }
            }
        }

        return result;
    }

    private List<(string TargetInterface, string CalledMethod)> GetMethodCalls(MethodDeclarationSyntax method, SemanticModel model)
    {
        var result = new List<(string, string)>();
        foreach (var invocation in method.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            var symbol = model.GetSymbolInfo(invocation).Symbol;
            if (symbol?.ContainingType?.TypeKind == TypeKind.Interface)
            {
                result.Add((symbol.ContainingType.Name, symbol.Name));
            }
        }
        return result;
    }

    private Document? FindDocument(string relativePath)
    {
        var fullPath = Path.GetFullPath(Path.Combine(_solutionDir, relativePath));
        foreach (var project in _solution.Projects)
        {
            var doc = project.Documents.FirstOrDefault(d =>
                d.FilePath?.Equals(fullPath, StringComparison.OrdinalIgnoreCase) == true);
            if (doc is not null) return doc;
        }
        return null;
    }

    private Task<string> RunGitAsync(string arguments) => RunCommandAsync("git", arguments);

    private async Task<string> RunCommandAsync(string command, string arguments)
    {
        try
        {
            var psi = new ProcessStartInfo(command, arguments)
            {
                WorkingDirectory = _solutionDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var process = Process.Start(psi);
            if (process is null) return "";

            // Read stdout and stderr concurrently to prevent deadlock when either buffer fills
            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            await process.WaitForExitAsync(cts.Token);

            var output = await stdoutTask;
            var stderr = await stderrTask;

            if (process.ExitCode != 0 && !string.IsNullOrWhiteSpace(stderr))
                Console.Error.WriteLine($"  [{command}] stderr: {stderr.Trim()}");

            return output;
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine($"  [{command} {arguments}] timed out after 30s");
            return "";
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  [{command} {arguments}] failed: {ex.Message}");
            return "";
        }
    }

    private static string DetectProjectFromPath(string filePath)
    {
        // Look for the first directory segment that likely represents a project
        // Common patterns: src/ProjectName/..., ProjectName/...
        var parts = filePath.Replace("\\", "/").Split('/');

        // Find the segment that contains a project-like name
        // Strategy: look for parts that match known project directory patterns
        // or the first meaningful directory after src/
        for (int i = 0; i < parts.Length - 1; i++)
        {
            var part = parts[i];

            // Skip common non-project directories
            if (part is "src" or "test" or "tests" or "." or ".." or "") continue;

            // If this directory likely contains source files (next parts are files or subdirs)
            // return it as the project name
            return part;
        }

        return "Other";
    }

    private static string DetectFileType(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext switch
        {
            ".cs" => "csharp",
            ".json" => "json",
            ".yaml" or ".yml" => "yaml",
            ".sql" => "sql",
            ".xml" or ".csproj" or ".props" or ".targets" => "xml",
            ".js" or ".ts" or ".tsx" or ".jsx" => "javascript",
            ".css" or ".scss" => "css",
            ".md" => "markdown",
            _ => "other"
        };
    }

    private static string SanitizeId(string input) => input
        .Replace("<", "_").Replace(">", "_").Replace(".", "_")
        .Replace(",", "_").Replace(" ", "_").Replace("?", "")
        .Replace("(", "").Replace(")", "").Replace("/", "_").Replace("\\", "_");
}

// ====== MR Graph Model ======

public class CanvasConfig
{
    public double DefaultZoom { get; set; } = 1.0;
    public int NodeWidth { get; set; } = 520;
    public string RankDirection { get; set; } = "LR";
    public int MaxVisibleLines { get; set; } = 25;
}

public class MrGraph
{
    public string BranchName { get; set; } = "";
    public int TotalFiles { get; set; }
    public int TotalAdditions { get; set; }
    public int TotalDeletions { get; set; }
    public CanvasConfig? Config { get; set; }
    public List<MrFileNode> Files { get; } = [];
    public List<MrEdge> Edges { get; } = [];
}

public class MrFileNode
{
    public string Id { get; set; } = "";
    public string FileName { get; set; } = "";
    public string FilePath { get; set; } = "";
    public int Additions { get; set; }
    public int Deletions { get; set; }
    public bool IsNew { get; set; }
    public bool IsChanged { get; set; } = true;
    public string FileType { get; set; } = "other"; // "csharp", "json", "yaml", "sql", "xml", "javascript", "css", "markdown", "other"
    public string ProjectName { get; set; } = "";
    public List<MrCodeSection> Sections { get; } = [];
    public List<MrDependency> Dependencies { get; } = [];
    public List<MrMethodCall> MethodCalls { get; } = [];
}

public class MrCodeSection
{
    public string Header { get; set; } = "";
    public List<MrCodeLine> Lines { get; } = [];
}

public class MrCodeLine
{
    public int LineNum { get; set; }
    public string Text { get; set; } = "";
    public string DiffType { get; set; } = "context"; // context | add | remove
}

public class MrDependency
{
    public string InterfaceName { get; set; } = "";
    public string ParamName { get; set; } = "";
}

public class MrMethodCall
{
    public string FromMethod { get; set; } = "";
    public string TargetInterface { get; set; } = "";
    public string CalledMethod { get; set; } = "";
    public bool IsInChangedCode { get; set; }
}

public class MrEdge
{
    public string FromFileId { get; set; } = "";
    public string ToFileId { get; set; } = "";
    public string InterfaceName { get; set; } = "";
    public string? ParamName { get; set; }
    public string Type { get; set; } = ""; // di | calls | di-ghost
    public List<string> MethodCalls { get; } = [];
}
