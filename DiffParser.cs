using System.Text.RegularExpressions;

namespace CodeAtlas;

/// <summary>
/// Parses unified diff output (git diff) into structured data.
/// </summary>
public static partial class DiffParser
{
    public static List<DiffFile> Parse(string diffText)
    {
        var files = new List<DiffFile>();
        DiffFile? current = null;
        DiffHunk? currentHunk = null;
        int oldLine = 0, newLine = 0;
        var hasGitHeaders = diffText.Contains("diff --git");

        foreach (var rawLine in diffText.Split('\n'))
        {
            // New file: diff --git a/path b/path
            if (rawLine.StartsWith("diff --git"))
            {
                current = new DiffFile();
                files.Add(current);
                currentHunk = null;
                continue;
            }

            // Old file path
            if (rawLine.StartsWith("--- "))
            {
                if (!hasGitHeaders && (current is null || current.Hunks.Count > 0))
                {
                    // glab format: no "diff --git" lines, so "---" marks a new file
                    current = new DiffFile();
                    files.Add(current);
                    currentHunk = null;
                }

                if (current is null) continue;

                if (rawLine.StartsWith("--- a/"))
                    current.OldPath = rawLine[6..];
                else if (rawLine.StartsWith("--- /dev/null"))
                    current.IsNew = true;
                else if (rawLine.Length > 4)
                    current.OldPath = rawLine[4..];
                continue;
            }

            if (current is null) continue;

            // New file path
            if (rawLine.StartsWith("+++ "))
            {
                if (rawLine.StartsWith("+++ b/"))
                    current.NewPath = rawLine[6..];
                else if (rawLine.StartsWith("+++ /dev/null"))
                    current.IsDeleted = true;
                else if (rawLine.Length > 4)
                    current.NewPath = rawLine[4..];
                continue;
            }

            // Hunk header: @@ -old,count +new,count @@
            var hunkMatch = HunkHeaderRegex().Match(rawLine);
            if (hunkMatch.Success)
            {
                oldLine = int.Parse(hunkMatch.Groups[1].Value);
                newLine = int.Parse(hunkMatch.Groups[3].Value);
                currentHunk = new DiffHunk
                {
                    OldStart = oldLine,
                    NewStart = newLine,
                    Header = rawLine
                };
                current.Hunks.Add(currentHunk);
                continue;
            }

            if (currentHunk is null) continue;

            // Skip binary/mode lines
            if (rawLine.StartsWith("Binary") || rawLine.StartsWith("index ") ||
                rawLine.StartsWith("new file") || rawLine.StartsWith("deleted file") ||
                rawLine.StartsWith("old mode") || rawLine.StartsWith("new mode") ||
                rawLine.StartsWith("similarity") || rawLine.StartsWith("rename"))
                continue;

            // Diff lines
            if (rawLine.StartsWith('+'))
            {
                currentHunk.Lines.Add(new DiffLine(DiffLineType.Add, rawLine[1..], null, newLine));
                newLine++;
            }
            else if (rawLine.StartsWith('-'))
            {
                currentHunk.Lines.Add(new DiffLine(DiffLineType.Remove, rawLine[1..], oldLine, null));
                oldLine++;
            }
            else if (rawLine.TrimEnd('\r').StartsWith(' '))
            {
                var trimmed = rawLine.TrimEnd('\r');
                var text = trimmed.Length > 0 ? trimmed[1..] : "";
                currentHunk.Lines.Add(new DiffLine(DiffLineType.Context, text, oldLine, newLine));
                oldLine++;
                newLine++;
            }
        }

        return files;
    }

    [GeneratedRegex(@"^@@ -(\d+)(,\d+)? \+(\d+)(,\d+)? @@")]
    private static partial Regex HunkHeaderRegex();
}

public class DiffFile
{
    public string? OldPath { get; set; }
    public string? NewPath { get; set; }
    public bool IsNew { get; set; }
    public bool IsDeleted { get; set; }
    public List<DiffHunk> Hunks { get; } = [];

    public string Path => NewPath ?? OldPath ?? "unknown";
    public string FileName => System.IO.Path.GetFileName(Path);
    public bool IsCSharp => Path.EndsWith(".cs", StringComparison.OrdinalIgnoreCase);

    public string FileType => System.IO.Path.GetExtension(Path).ToLowerInvariant() switch
    {
        ".cs" => "csharp",
        ".py" => "python",
        ".ts" or ".tsx" => "typescript",
        ".js" or ".jsx" => "javascript",
        ".json" => "json",
        ".yaml" or ".yml" => "yaml",
        ".css" or ".scss" or ".less" => "css",
        ".html" or ".htm" => "html",
        ".sql" => "sql",
        ".xml" or ".csproj" or ".props" or ".targets" => "xml",
        ".md" => "markdown",
        ".toml" => "toml",
        ".cfg" or ".ini" or ".conf" => "config",
        _ => "plain"
    };

    public int Additions => Hunks.Sum(h => h.Lines.Count(l => l.Type == DiffLineType.Add));
    public int Deletions => Hunks.Sum(h => h.Lines.Count(l => l.Type == DiffLineType.Remove));
}

public class DiffHunk
{
    public int OldStart { get; set; }
    public int NewStart { get; set; }
    public string Header { get; set; } = "";
    public List<DiffLine> Lines { get; } = [];
}

public record DiffLine(DiffLineType Type, string Text, int? OldLineNum, int? NewLineNum);

public enum DiffLineType { Context, Add, Remove }
