using System.Diagnostics;

namespace CodeAtlas;

/// <summary>
/// Runs git and external CLI commands with timeout, stderr capture, and structured output.
/// Shared by both MrAnalyzer (Roslyn mode) and MrAnalyzerLite (non-C# mode).
/// </summary>
internal sealed class GitCommandRunner
{
    private readonly string _workingDirectory;
    private readonly TimeSpan _timeout;

    internal GitCommandRunner(string workingDirectory, TimeSpan? timeout = null)
    {
        _workingDirectory = workingDirectory;
        _timeout = timeout ?? Defaults.CommandTimeout;
    }

    internal Task<string> RunGitAsync(string arguments) => RunCommandAsync("git", arguments);

    internal async Task<string> RunCommandAsync(string command, string arguments)
    {
        try
        {
            var psi = new ProcessStartInfo(command, arguments)
            {
                WorkingDirectory       = _workingDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true
            };
            using var process = Process.Start(psi);
            if (process is null) return "";

            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();

            using var cts = new CancellationTokenSource(_timeout);
            await process.WaitForExitAsync(cts.Token);

            var output = await stdoutTask;
            var stderr = await stderrTask;

            if (process.ExitCode != 0 && !string.IsNullOrWhiteSpace(stderr))
                Console.Error.WriteLine($"  [{command}] stderr: {stderr.Trim()}");

            return output;
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine($"  [{command} {arguments}] timed out after {_timeout.TotalSeconds}s");
            return "";
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  [{command} {arguments}] failed: {ex.Message}");
            return "";
        }
    }

    /// <summary>
    /// Resolves the diff text for a branch or MR ID, trying multiple strategies:
    /// 1. Local branch diff
    /// 2. Fetch from origin and retry
    /// 3. glab MR diff (GitLab CLI)
    /// 4. Direct diff fallback
    /// </summary>
    internal async Task<string> GetDiffAsync(string branchOrMrId, string targetBranch)
    {
        if (branchOrMrId.StartsWith("--"))
            throw new ArgumentException($"Invalid branch/MR ID '{branchOrMrId}': must not start with '--'.", nameof(branchOrMrId));

        var result = await RunGitAsync($"diff {targetBranch}...{branchOrMrId} {Defaults.DiffFormat}");
        if (!string.IsNullOrWhiteSpace(result)) return result;

        Console.Error.WriteLine("  Local branch not found, trying origin/...");
        await RunGitAsync("fetch origin");
        result = await RunGitAsync($"diff {targetBranch}...origin/{branchOrMrId} {Defaults.DiffFormat}");
        if (!string.IsNullOrWhiteSpace(result)) return result;

        Console.Error.WriteLine("  Trying glab mr diff...");
        result = await RunCommandAsync("glab", $"mr diff {branchOrMrId}");
        if (!string.IsNullOrWhiteSpace(result)) return result;

        return await RunGitAsync($"diff {branchOrMrId} {Defaults.DiffFormat}");
    }
}
