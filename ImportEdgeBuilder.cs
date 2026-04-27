using System.Text.RegularExpressions;

namespace CodeAtlas;

internal static partial class ImportEdgeBuilder
{
    [GeneratedRegex(@"^from\s+(\S+)\s+import", RegexOptions.Compiled)]
    private static partial Regex PythonImportFrom();

    [GeneratedRegex(@"^import\s+(\S+)", RegexOptions.Compiled)]
    private static partial Regex PythonImport();

    [GeneratedRegex(@"from\s+['""]([^'""]+)['""]", RegexOptions.Compiled)]
    private static partial Regex TsEsImport();

    [GeneratedRegex(@"require\(['""]([^'""]+)['""]\)", RegexOptions.Compiled)]
    private static partial Regex RequireCall();

    internal static void Build(MrGraph graph, IEnumerable<DiffFile> diffFiles)
    {
        var fileIndex = BuildFileIndex(graph);
        var seen = new HashSet<string>();

        foreach (var diffFile in diffFiles.Where(f => !f.IsDeleted))
        {
            var source = graph.Files.FirstOrDefault(f => f.FilePath == diffFile.Path);
            if (source is null) continue;

            foreach (var import in ExtractImports(diffFile))
            {
                var target = ResolveImport(import, fileIndex);
                if (target is null || target.Id == source.Id) continue;

                var key = $"{source.Id}->{target.Id}";
                if (!seen.Add(key)) continue;

                graph.Edges.Add(new MrEdge
                {
                    FromFileId    = source.Id,
                    ToFileId      = target.Id,
                    InterfaceName = "imports",
                    Type          = "imports"
                });
            }
        }
    }

    private static Dictionary<string, MrFileNode> BuildFileIndex(MrGraph graph)
    {
        var index = new Dictionary<string, MrFileNode>(StringComparer.OrdinalIgnoreCase);
        foreach (var f in graph.Files)
        {
            index.TryAdd(f.FilePath, f);
            index.TryAdd(f.FileName, f);
            index.TryAdd(Path.GetFileNameWithoutExtension(f.FileName), f);
        }
        return index;
    }

    private static MrFileNode? ResolveImport(string import, Dictionary<string, MrFileNode> index)
    {
        if (index.TryGetValue(import, out var hit)) return hit;
        if (index.TryGetValue(Path.GetFileName(import), out hit)) return hit;
        if (index.TryGetValue(Path.GetFileNameWithoutExtension(import), out hit)) return hit;
        var segments = import.Split('.', '/');
        index.TryGetValue(segments[^1], out hit);
        return hit;
    }

    private static List<string> ExtractImports(DiffFile file)
    {
        var imports = new List<string>();
        foreach (var line in file.Hunks.SelectMany(h => h.Lines).Select(l => l.Text))
        {
            var t = line.TrimStart();
            Match m;

            m = PythonImportFrom().Match(t);
            if (m.Success) { imports.Add(m.Groups[1].Value); continue; }

            m = PythonImport().Match(t);
            if (m.Success) { imports.Add(m.Groups[1].Value); continue; }

            m = TsEsImport().Match(t);
            if (m.Success && m.Groups[1].Value.StartsWith('.')) { imports.Add(m.Groups[1].Value); continue; }

            m = RequireCall().Match(t);
            if (m.Success && m.Groups[1].Value.StartsWith('.')) { imports.Add(m.Groups[1].Value); }
        }
        return imports;
    }
}
