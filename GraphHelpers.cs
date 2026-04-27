namespace CodeAtlas;

internal static class GraphHelpers
{
    internal static string SanitizeId(string input) => input
        .Replace("<", "_").Replace(">", "_").Replace(".", "_")
        .Replace(",", "_").Replace(" ", "_").Replace("?", "")
        .Replace("(", "").Replace(")", "").Replace("/", "_").Replace("\\", "_");

    internal static string StripInterfacePrefix(string name) =>
        name.StartsWith("I") && name.Length > 1 && char.IsUpper(name[1]) ? name[1..] : name;

    internal static string DetectFileType(string path) =>
        Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".cs"                                          => "csharp",
            ".py"                                          => "python",
            ".ts" or ".tsx"                                => "typescript",
            ".js" or ".jsx"                                => "javascript",
            ".json"                                        => "json",
            ".yaml" or ".yml"                              => "yaml",
            ".css" or ".scss" or ".less"                   => "css",
            ".html" or ".htm"                              => "html",
            ".sql"                                         => "sql",
            ".xml" or ".csproj" or ".props" or ".targets"  => "xml",
            ".md"                                          => "markdown",
            ".toml"                                        => "toml",
            ".cfg" or ".ini" or ".conf"                    => "config",
            _                                              => "other"
        };

    internal static string DetectProjectFromPath(string filePath)
    {
        var parts = filePath.Replace("\\", "/").Split('/');
        for (int i = 0; i < parts.Length - 1; i++)
        {
            var part = parts[i];
            if (part is "src" or "test" or "tests" or "." or ".." or "") continue;
            return part;
        }
        return "Other";
    }

    internal static void BuildSections(MrFileNode fileNode, IEnumerable<DiffHunk> hunks)
    {
        foreach (var hunk in hunks)
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
                        DiffLineType.Add    => "add",
                        DiffLineType.Remove => "remove",
                        _                   => "context"
                    }
                });
            }
            fileNode.Sections.Add(section);
        }
    }

    internal static void ComputeImpactRadii(MrGraph graph)
    {
        foreach (var file in graph.Files.Where(f => f.IsChanged))
        {
            var visited = new HashSet<string>();
            var queue = new Queue<string>();
            queue.Enqueue(file.Id);
            visited.Add(file.Id);
            while (queue.Count > 0)
            {
                var current = queue.Dequeue();
                foreach (var edge in graph.Edges.Where(e => e.FromFileId == current))
                {
                    if (visited.Add(edge.ToFileId))
                        queue.Enqueue(edge.ToFileId);
                }
            }
            file.ImpactRadius = visited.Count - 1;
        }
    }
}
