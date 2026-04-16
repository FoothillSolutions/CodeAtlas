using System.Text.Json;

using CodeAtlas;

return await RunMrMode(args);

// ====== MR Mode ======
async Task<int> RunMrMode(string[] a)
{
    // --repo <path> allows pointing at any repo directory (finds .sln automatically)
    var repoIdx = Array.IndexOf(a, "--repo");
    string? repoPath = repoIdx >= 0 && repoIdx + 1 < a.Length ? a[repoIdx + 1] : null;

    string? sln = null;
    bool noRoslyn = a.Contains("--no-roslyn");

    if (!noRoslyn)
    {
        if (repoPath is not null)
        {
            var fullRepoPath = Path.GetFullPath(repoPath);
            sln = Directory.GetFiles(fullRepoPath, "*.sln").FirstOrDefault();
            if (sln is null)
            {
                Console.Error.WriteLine($"No .sln file found in: {fullRepoPath} — running in diff-only mode");
                noRoslyn = true;
            }
        }
        else
        {
            sln = a.FirstOrDefault(x => x.EndsWith(".sln")) ?? FindSolutionPath();
            if (sln is null)
            {
                Console.Error.WriteLine("No .sln found — running in diff-only mode (no semantic analysis)");
                noRoslyn = true;
            }
        }
    }

    var mrIdx = Array.IndexOf(a, "--mr");
    var branchOrId = mrIdx >= 0 && mrIdx + 1 < a.Length ? a[mrIdx + 1] : null;

    if (branchOrId is null)
    {
        Console.Error.WriteLine("Usage: CodeAtlas --mr <branch-or-mr-id> [--repo <repo-path>] [--no-roslyn]");
        Console.Error.WriteLine("       CodeAtlas <solution.sln> --mr <branch-or-mr-id>");
        return 1;
    }

    var workingDir = repoPath is not null ? Path.GetFullPath(repoPath) : (sln is not null ? Path.GetDirectoryName(sln)! : Directory.GetCurrentDirectory());

    MrGraph mrGraph;

    if (noRoslyn)
    {
        Console.Error.WriteLine($"Mode: diff-only (no Roslyn)");
        Console.Error.WriteLine($"MR/Branch: {branchOrId}");
        var analyzer = new MrAnalyzerLite(workingDir);
        mrGraph = await analyzer.AnalyzeAsync(branchOrId);
    }
    else
    {
        Console.Error.WriteLine($"Solution: {sln}");
        Console.Error.WriteLine($"MR/Branch: {branchOrId}");

        Microsoft.Build.Locator.MSBuildLocator.RegisterDefaults();
        Console.Error.WriteLine("Loading solution...");
        using var ws = Microsoft.CodeAnalysis.MSBuild.MSBuildWorkspace.Create();
        ws.WorkspaceFailed += (_, e) =>
        {
            if (e.Diagnostic.Kind == Microsoft.CodeAnalysis.WorkspaceDiagnosticKind.Failure)
                Console.Error.WriteLine($"  Workspace error: {e.Diagnostic.Message}");
        };
        var solution = await ws.OpenSolutionAsync(sln!);
        Console.Error.WriteLine($"Loaded {solution.Projects.Count()} projects.");

        var analyzer = new MrAnalyzer(solution, sln!);
        mrGraph = await analyzer.AnalyzeAsync(branchOrId);
    }

    // Load canvas config from repo directory
    mrGraph.Config = LoadConfig(workingDir);

    Console.Error.WriteLine($"MR: {mrGraph.Files.Count} files, {mrGraph.Edges.Count} edges");

    if (a.Any(x => x == "--json"))
    {
        var jsonOptions = new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };
        Console.WriteLine(JsonSerializer.Serialize(mrGraph, jsonOptions));
        return 0;
    }

    var outputDir = Path.Combine(Directory.GetCurrentDirectory(), "output-codeatlas");
    Directory.CreateDirectory(outputDir);
    var safeName = branchOrId!.Replace("/", "_").Replace("\\", "_");
    var outputPath = Path.GetFullPath(Path.Combine(outputDir, $"{safeName}.html"));
    await File.WriteAllTextAsync(outputPath, MrHtmlRenderer.Render(mrGraph));
    Console.Error.WriteLine($"Output: {outputPath}");
    return 0;
}

// ====== Config Loading ======
static CanvasConfig LoadConfig(string repoDir)
{
    var configPath = Path.Combine(repoDir, ".codeatlas.json");
    if (File.Exists(configPath))
    {
        try
        {
            var json = File.ReadAllText(configPath);
            return JsonSerializer.Deserialize<CanvasConfig>(json, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            }) ?? new CanvasConfig();
        }
        catch
        {
            Console.Error.WriteLine($"Warning: Could not parse {configPath}, using defaults.");
            return new CanvasConfig();
        }
    }
    return new CanvasConfig();
}

// ====== Helpers ======
string? FindSolutionPath()
{
    var dir = Directory.GetCurrentDirectory();
    while (dir is not null)
    {
        var slnFiles = Directory.GetFiles(dir, "*.sln");
        if (slnFiles.Length > 0) return slnFiles[0];
        dir = Directory.GetParent(dir)?.FullName;
    }
    return null;
}
