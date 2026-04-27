using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis.MSBuild;
using System.Text.Json;

namespace CodeAtlas;

internal sealed class CliRunner
{
    internal async Task<int> RunAsync(string[] args)
    {
        var repoPath     = ArgValue(args, "--repo");
        var branchOrId   = ArgValue(args, "--mr");
        var targetBranch = ArgValue(args, "--target") ?? Defaults.DefaultTargetBranch;
        var explicitSln  = ArgValue(args, "--sln");

        if (branchOrId is null || repoPath is null)
        {
            Console.Error.WriteLine("Usage: CodeAtlas --mr <branch-or-mr-id> --repo <repo-path> [--sln <solution>] [--target <branch>] [--json]");
            return 1;
        }

        var originalRepoDir = Path.GetFullPath(repoPath);

        string? sln = ResolveSolution(explicitSln, originalRepoDir);

        Console.Error.WriteLine($"Repo:          {originalRepoDir}");
        Console.Error.WriteLine($"MR/Branch:     {branchOrId}");
        Console.Error.WriteLine($"Target branch: {targetBranch}");

        if (sln is null)
        {
            Console.Error.WriteLine("No .sln found — running in Lite mode (non-C# analysis only).");
            return await RunLiteMode(args, branchOrId, targetBranch, originalRepoDir);
        }

        Console.Error.WriteLine($"Solution:      {sln}");
        return await RunRoslynMode(args, branchOrId, targetBranch, sln, originalRepoDir);
    }

    private static async Task<int> RunRoslynMode(string[] args, string branchOrId, string targetBranch, string sln, string originalRepoDir)
    {
        WorktreeHelper? worktree = null;
        var solutionToLoad = sln;
        var gitDir = originalRepoDir;

        try
        {
            worktree = await WorktreeHelper.CreateAsync(originalRepoDir, branchOrId);
            if (worktree is not null)
            {
                gitDir = worktree.OriginalRepoPath;

                var worktreeSln = ResolveWorktreeSln(sln, worktree);
                if (worktreeSln is not null)
                {
                    solutionToLoad = worktreeSln;
                    Console.Error.WriteLine($"  Using worktree solution: {worktreeSln}");
                }
                else
                {
                    Console.Error.WriteLine("  Worktree has no .sln file, falling back to original.");
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  Worktree setup failed ({ex.Message}), falling back to original.");
        }

        try
        {
            MSBuildLocator.RegisterDefaults();
            Console.Error.WriteLine("Loading solution...");
            using var ws = MSBuildWorkspace.Create();
            ws.WorkspaceFailed += (_, e) =>
            {
                if (e.Diagnostic.Kind == Microsoft.CodeAnalysis.WorkspaceDiagnosticKind.Failure)
                    Console.Error.WriteLine($"  Workspace error: {e.Diagnostic.Message}");
            };
            var solution = await ws.OpenSolutionAsync(solutionToLoad);
            Console.Error.WriteLine($"Loaded {solution.Projects.Count()} projects.");

            var analyzer = new MrAnalyzer(solution, solutionToLoad, gitDir, worktree?.WorktreePath);
            var mrGraph  = await analyzer.AnalyzeAsync(branchOrId, targetBranch);

            mrGraph.RepoName = new DirectoryInfo(originalRepoDir).Name;
            mrGraph.Config   = LoadConfig(originalRepoDir);

            return WriteOutput(args, mrGraph, branchOrId, originalRepoDir);
        }
        finally
        {
            if (worktree is not null)
                await worktree.DisposeAsync();
        }
    }

    private static async Task<int> RunLiteMode(string[] args, string branchOrId, string targetBranch, string originalRepoDir)
    {
        WorktreeHelper? worktree = null;
        var gitDir = originalRepoDir;

        try
        {
            worktree = await WorktreeHelper.CreateAsync(originalRepoDir, branchOrId);
            if (worktree is not null)
                gitDir = worktree.OriginalRepoPath;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  Worktree setup failed ({ex.Message}), falling back to original.");
        }

        try
        {
            var analyzer = new MrAnalyzerLite(gitDir);
            var mrGraph  = await analyzer.AnalyzeAsync(branchOrId, targetBranch);

            mrGraph.RepoName = new DirectoryInfo(originalRepoDir).Name;
            mrGraph.Config   = LoadConfig(originalRepoDir);

            return WriteOutput(args, mrGraph, branchOrId, originalRepoDir);
        }
        finally
        {
            if (worktree is not null)
                await worktree.DisposeAsync();
        }
    }

    private static string? ResolveSolution(string? explicitSln, string repoPath)
    {
        if (explicitSln is not null)
        {
            var full = Path.GetFullPath(explicitSln);
            if (!File.Exists(full))
            {
                Console.Error.WriteLine($"Solution file not found: {full}");
                return null;
            }
            return full;
        }

        return Directory.GetFiles(repoPath, "*.sln", SearchOption.TopDirectoryOnly).FirstOrDefault();
    }

    private static string? ResolveWorktreeSln(string originalSln, WorktreeHelper worktree)
    {
        var slnRelative = Path.GetRelativePath(worktree.OriginalRepoPath, originalSln);
        var candidate   = Path.Combine(worktree.WorktreePath, slnRelative);
        if (File.Exists(candidate)) return candidate;

        var searchDir = worktree.WorktreeSubPath;
        return Directory.Exists(searchDir)
            ? Directory.GetFiles(searchDir, "*.sln").FirstOrDefault()
            : null;
    }

    private static int WriteOutput(string[] args, MrGraph mrGraph, string branchOrId, string originalRepoDir)
    {
        Console.Error.WriteLine($"MR: {mrGraph.Files.Count} files, {mrGraph.Edges.Count} edges");

        if (args.Any(x => x == "--json"))
        {
            var jsonOptions = new JsonSerializerOptions
            {
                WriteIndented        = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                Encoder              = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };
            Console.WriteLine(JsonSerializer.Serialize(mrGraph, jsonOptions));
            return 0;
        }

        var outputDir  = Path.Combine(Directory.GetCurrentDirectory(), "output-codeatlas");
        Directory.CreateDirectory(outputDir);
        var safeMr     = branchOrId.Replace("/", "_").Replace("\\", "_");
        var safeRepo   = mrGraph.RepoName.Replace("/", "_").Replace("\\", "_");
        var outputPath = Path.GetFullPath(Path.Combine(outputDir, $"{safeRepo}-{safeMr}.html"));
        File.WriteAllText(outputPath, MrHtmlRenderer.Render(mrGraph));
        Console.Error.WriteLine($"Output: {outputPath}");
        return 0;
    }

    private static CanvasConfig LoadConfig(string repoDir)
    {
        var configPath = Path.Combine(repoDir, ".codeatlas.json");
        if (!File.Exists(configPath)) return new CanvasConfig();
        try
        {
            return JsonSerializer.Deserialize<CanvasConfig>(File.ReadAllText(configPath), new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            }) ?? new CanvasConfig();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Warning: Could not parse {configPath}: {ex.Message}");
            return new CanvasConfig();
        }
    }

    private static string? ArgValue(string[] args, string flag)
    {
        var idx = Array.IndexOf(args, flag);
        return idx >= 0 && idx + 1 < args.Length ? args[idx + 1] : null;
    }
}
