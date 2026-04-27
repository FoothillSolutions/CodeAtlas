namespace CodeAtlas;

public class MrAnalyzerLite
{
    private readonly GitCommandRunner _git;

    public MrAnalyzerLite(string gitDir)
    {
        _git = new GitCommandRunner(gitDir);
    }

    public async Task<MrGraph> AnalyzeAsync(string branchOrMrId, string targetBranch = Defaults.DefaultTargetBranch)
    {
        var graph = new MrGraph();

        var diffText = await _git.GetDiffAsync(branchOrMrId, targetBranch);
        if (string.IsNullOrEmpty(diffText))
        {
            Console.Error.WriteLine("No diff output. Check branch/MR ID.");
            return graph;
        }

        var diffFiles = DiffParser.Parse(diffText);
        Console.Error.WriteLine($"Found {diffFiles.Count} changed files.");

        graph.BranchName     = branchOrMrId;
        graph.TotalFiles     = diffFiles.Count;
        graph.TotalAdditions = diffFiles.Sum(f => f.Additions);
        graph.TotalDeletions = diffFiles.Sum(f => f.Deletions);

        AddNonCSharpNodes(diffFiles, graph);
        BuildImportEdges(diffFiles, graph);
        GraphHelpers.ComputeImpactRadii(graph);

        return graph;
    }

    public void AddNonCSharpNodes(IReadOnlyList<DiffFile> diffFiles, MrGraph graph)
    {
        var nonCs = diffFiles.Where(f => !f.IsCSharp && !f.IsDeleted).ToList();
        Console.Error.WriteLine($"  Processing {nonCs.Count} non-C# files.");

        foreach (var diffFile in nonCs)
        {
            var pathParts = diffFile.Path.Replace("\\", "/").Split('/');
            var inferredNamespace = pathParts.FirstOrDefault(p => p.Contains('.') && !Path.HasExtension(p));

            var node = new MrFileNode
            {
                Id            = GraphHelpers.SanitizeId(diffFile.Path),
                FileName      = diffFile.FileName,
                FilePath      = diffFile.Path,
                Additions     = diffFile.Additions,
                Deletions     = diffFile.Deletions,
                IsNew         = diffFile.IsNew,
                IsChanged     = true,
                FileType      = diffFile.FileType,
                ProjectName   = GraphHelpers.DetectProjectFromPath(diffFile.Path),
                Namespace     = inferredNamespace
            };

            GraphHelpers.BuildSections(node, diffFile.Hunks);
            graph.Files.Add(node);
        }
    }

    public void BuildImportEdges(IReadOnlyList<DiffFile> diffFiles, MrGraph graph)
    {
        ImportEdgeBuilder.Build(graph, diffFiles);
    }
}
