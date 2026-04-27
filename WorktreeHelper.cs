using System.Diagnostics;

namespace CodeAtlas;

/// <summary>
/// Temporary git worktree at the MR branch head so Roslyn can see newly created files.
/// WorktreePath = root of the worktree checkout (git root equivalent).
/// OriginalRepoPath = the git root of the untouched repo — run glab/git diff from here.
/// SubDirectory = relative path from git root to the --repo dir (e.g. "Application").
/// Returns null from CreateAsync on failure (caller falls back to current behavior).
/// </summary>
public sealed class WorktreeHelper : IAsyncDisposable
{
    public string WorktreePath { get; }
    public string OriginalRepoPath { get; }
    public string SubDirectory { get; }

    public string WorktreeSubPath => string.IsNullOrEmpty(SubDirectory)
        ? WorktreePath
        : Path.Combine(WorktreePath, SubDirectory);

    private WorktreeHelper(string worktreePath, string originalRepoPath, string subDirectory)
    {
        WorktreePath = worktreePath;
        OriginalRepoPath = originalRepoPath;
        SubDirectory = subDirectory;
    }

    public static async Task<WorktreeHelper?> CreateAsync(string repoPath, string branchOrMrId)
    {
        var fullRepoPath = Path.GetFullPath(repoPath);

        var gitRoot = await GetGitRootAsync(fullRepoPath);
        if (gitRoot is null)
        {
            Console.Error.WriteLine("  Worktree: not a git repository, falling back.");
            return null;
        }

        var subDir = Path.GetRelativePath(gitRoot, fullRepoPath);
        if (subDir == ".") subDir = "";

        await RunGitAsync(gitRoot, "worktree prune");

        string? checkoutRef = null;

        if (int.TryParse(branchOrMrId, out var mrIid))
        {
            // GitLab exposes every MR as refs/merge-requests/<iid>/head — no local branch needed
            var fetchRef = $"refs/merge-requests/{mrIid}/head";
            Console.Error.WriteLine($"  Worktree: fetching MR ref {fetchRef}...");

            var (fetchOk, _) = await RunGitAsync(gitRoot, $"fetch origin {fetchRef}");
            if (!fetchOk)
            {
                Console.Error.WriteLine("  Worktree: failed to fetch MR ref, falling back.");
                return null;
            }
            checkoutRef = "FETCH_HEAD";
        }
        else
        {
            Console.Error.WriteLine($"  Worktree: fetching branch origin/{branchOrMrId}...");

            var (fetchOk, _) = await RunGitAsync(gitRoot, $"fetch origin {branchOrMrId}");
            if (!fetchOk)
            {
                Console.Error.WriteLine($"  Worktree: failed to fetch origin/{branchOrMrId}, falling back.");
                return null;
            }
            checkoutRef = $"origin/{branchOrMrId}";
        }

        var tmpDir = Path.Combine(Path.GetTempPath(), $"codeatlas-{branchOrMrId}-{Guid.NewGuid().ToString()[..8]}");

        Console.Error.WriteLine($"  Worktree: creating at {tmpDir}...");
        var (addOk, addErr) = await RunGitAsync(gitRoot, $"worktree add \"{tmpDir}\" {checkoutRef} --detach");
        if (!addOk)
        {
            Console.Error.WriteLine($"  Worktree: failed to create worktree: {addErr}");
            TryDeleteDirectory(tmpDir);
            return null;
        }

        Console.Error.WriteLine($"  Worktree: ready at {tmpDir}" + (subDir != "" ? $" (subdir: {subDir})" : ""));
        return new WorktreeHelper(tmpDir, gitRoot, subDir);
    }

    public async ValueTask DisposeAsync()
    {
        Console.Error.WriteLine($"  Worktree: cleaning up {WorktreePath}...");

        var (ok, _) = await RunGitAsync(OriginalRepoPath, $"worktree remove \"{WorktreePath}\" --force");
        if (!ok)
        {
            TryDeleteDirectory(WorktreePath);
            await RunGitAsync(OriginalRepoPath, "worktree prune");
        }
    }

    private static async Task<string?> GetGitRootAsync(string workDir)
    {
        var (ok, stdout) = await RunGitWithOutputAsync(workDir, "rev-parse --show-toplevel");
        return ok ? stdout.Trim() : null;
    }

    private static async Task<(bool Success, string Stderr)> RunGitAsync(string workDir, string arguments)
    {
        var (success, _, stderr) = await RunGitCoreAsync(workDir, arguments);
        return (success, stderr);
    }

    private static async Task<(bool Success, string Stdout)> RunGitWithOutputAsync(string workDir, string arguments)
    {
        var (success, stdout, _) = await RunGitCoreAsync(workDir, arguments);
        return (success, stdout);
    }

    private static async Task<(bool Success, string Stdout, string Stderr)> RunGitCoreAsync(string workDir, string arguments)
    {
        try
        {
            var psi = new ProcessStartInfo("git", arguments)
            {
                WorkingDirectory = workDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var process = Process.Start(psi);
            if (process is null) return (false, "", "Failed to start git process");

            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();

            using var cts = new CancellationTokenSource(Defaults.WorktreeTimeout);
            await process.WaitForExitAsync(cts.Token);

            var stdout = await stdoutTask;
            var stderr = await stderrTask;

            return (process.ExitCode == 0, stdout.Trim(), stderr.Trim());
        }
        catch (OperationCanceledException)
        {
            return (false, "", "Timed out after 60s");
        }
        catch (Exception ex)
        {
            return (false, "", ex.Message);
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
                Directory.Delete(path, recursive: true);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  Worktree: failed to delete {path}: {ex.Message}");
        }
    }
}
