using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CodeAtlas;

public class MrAnalyzer
{
    private readonly Solution _solution;
    private readonly string _solutionDir;
    private readonly string _diffBaseDir;
    private readonly GitCommandRunner _git;
    private readonly MrAnalyzerLite _lite;

    public MrAnalyzer(Solution solution, string solutionPath, string? originalRepoDir = null, string? diffBaseDir = null)
    {
        _solution    = solution;
        _solutionDir = Path.GetDirectoryName(solutionPath)
            ?? throw new ArgumentException("Invalid solution path", nameof(solutionPath));
        var gitDir   = originalRepoDir ?? _solutionDir;
        _diffBaseDir = diffBaseDir ?? gitDir;
        _git         = new GitCommandRunner(gitDir);
        _lite        = new MrAnalyzerLite(gitDir);
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
        var csFiles   = diffFiles.Where(f => f.IsCSharp && !f.IsDeleted).ToList();
        Console.Error.WriteLine($"Found {diffFiles.Count} changed files, {csFiles.Count} are .cs files.");

        graph.BranchName    = branchOrMrId;
        graph.TotalFiles    = diffFiles.Count;
        graph.TotalAdditions = diffFiles.Sum(f => f.Additions);
        graph.TotalDeletions = diffFiles.Sum(f => f.Deletions);

        foreach (var diffFile in csFiles)
        {
            var doc = FindDocument(diffFile.Path);
            if (doc is null)
            {
                Console.Error.WriteLine($"  {diffFile.Path} not in solution, adding as diff-only (+{diffFile.Additions}/-{diffFile.Deletions})");
                AddDiffOnlyNode(diffFile, graph);
                continue;
            }

            Console.Error.WriteLine($"  Analyzing {diffFile.Path} (+{diffFile.Additions}/-{diffFile.Deletions})");
            await AnalyzeChangedFile(doc, diffFile, graph);
        }

        _lite.AddNonCSharpNodes(diffFiles, graph);
        _lite.BuildImportEdges(diffFiles, graph);

        await BuildCrossFileEdgesAsync(graph);
        GraphHelpers.ComputeImpactRadii(graph);

        return graph;
    }
    private static void AddDiffOnlyNode(DiffFile diffFile, MrGraph graph)
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
            FileType      = diffFile.FileType,
            ProjectName   = GraphHelpers.DetectProjectFromPath(diffFile.Path),
            Namespace     = inferredNamespace
        };

        GraphHelpers.BuildSections(node, diffFile.Hunks);
        graph.Files.Add(node);
    }



    private async Task AnalyzeChangedFile(Document doc, DiffFile diffFile, MrGraph graph)
    {
        var tree  = await doc.GetSyntaxTreeAsync();
        var model = await doc.GetSemanticModelAsync();
        if (tree is null || model is null) return;

        var root    = await tree.GetRootAsync();
        var nsDecl  = root.DescendantNodes().OfType<BaseNamespaceDeclarationSyntax>().FirstOrDefault();
        var classes = root.DescendantNodes().OfType<ClassDeclarationSyntax>().ToList();

        var (addedLines, changedRanges) = ComputeChangedRanges(diffFile.Hunks);

        var node = new MrFileNode
        {
            Id            = GraphHelpers.SanitizeId(diffFile.Path),
            FileName      = diffFile.FileName,
            FilePath      = diffFile.Path,
            Additions     = diffFile.Additions,
            Deletions     = diffFile.Deletions,
            IsNew         = diffFile.IsNew,
            FileType      = "csharp",
            ProjectName   = doc.Project.Name,
            Namespace     = nsDecl is not null ? model.GetDeclaredSymbol(nsDecl)?.ToDisplayString() : null
        };

        GraphHelpers.BuildSections(node, diffFile.Hunks);

        int callOrder = 0;
        foreach (var classSyntax in classes)
        {
            var classSymbol = model.GetDeclaredSymbol(classSyntax);
            if (classSymbol is null) continue;

            foreach (var (ifaceName, paramName) in GetConstructorParams(classSyntax, model))
            {
                node.Dependencies.Add(new MrDependency { InterfaceName = ifaceName, ParamName = paramName });
            }

            foreach (var method in classSyntax.Members.OfType<MethodDeclarationSyntax>())
            {
                var span  = method.GetLocation().GetLineSpan();
                var start = span.StartLinePosition.Line + 1;
                var end   = span.EndLinePosition.Line + 1;

                var hasChanges = addedLines.Any(ln => ln >= start && ln <= end)
                    || changedRanges.Any(r => r.Start <= end && r.End >= start);
                if (!hasChanges) continue;

                foreach (var (targetInterface, calledMethod) in GetMethodCalls(method, model))
                {
                    node.MethodCalls.Add(new MrMethodCall
                    {
                        FromMethod      = method.Identifier.Text,
                        TargetInterface = targetInterface,
                        CalledMethod    = calledMethod,
                        IsInChangedCode = true,
                        CallOrder       = callOrder++
                    });
                }
            }
        }

        foreach (var classSyntax in classes)
        {
            if (model.GetDeclaredSymbol(classSyntax) is not INamedTypeSymbol classSymbol) continue;

            var className = classSymbol.Name;
            var classNode = new MrClassNode
            {
                Id          = GraphHelpers.SanitizeId($"{doc.Project.Name}/{className}"),
                ClassName   = className,
                Namespace   = nsDecl is not null ? model.GetDeclaredSymbol(nsDecl)?.ToDisplayString() : null,
                FileId      = node.Id,
                ProjectName = doc.Project.Name,
                IsChanged   = true,
                IsInterface = false
            };

            foreach (var iface in classSymbol.AllInterfaces)
                classNode.Interfaces.Add(iface.Name);

            foreach (var method in classSyntax.Members.OfType<MethodDeclarationSyntax>())
                classNode.Methods.Add(method.Identifier.Text);

            graph.ClassNodes.Add(classNode);
        }

        foreach (var ifaceSyntax in root.DescendantNodes().OfType<InterfaceDeclarationSyntax>())
        {
            var ifaceSymbol = model.GetDeclaredSymbol(ifaceSyntax);
            if (ifaceSymbol is null) continue;

            var ifaceName = ifaceSymbol.Name;
            var ifaceNode = new MrClassNode
            {
                Id          = GraphHelpers.SanitizeId($"{doc.Project.Name}/{ifaceName}"),
                ClassName   = ifaceName,
                Namespace   = nsDecl is not null ? model.GetDeclaredSymbol(nsDecl)?.ToDisplayString() : null,
                FileId      = node.Id,
                ProjectName = doc.Project.Name,
                IsChanged   = true,
                IsInterface = true
            };

            foreach (var method in ifaceSyntax.Members.OfType<MethodDeclarationSyntax>())
                ifaceNode.Methods.Add(method.Identifier.Text);

            graph.ClassNodes.Add(ifaceNode);
        }

        graph.Files.Add(node);
    }

    private static (HashSet<int> AddedLines, List<(int Start, int End)> Ranges) ComputeChangedRanges(IEnumerable<DiffHunk> hunks)
    {
        var addedLines = new HashSet<int>();
        var ranges     = new List<(int, int)>();

        foreach (var hunk in hunks)
        {
            if (!hunk.Lines.Any(l => l.Type is DiffLineType.Add or DiffLineType.Remove)) continue;

            foreach (var line in hunk.Lines.Where(l => l.Type == DiffLineType.Add && l.NewLineNum.HasValue))
                addedLines.Add(line.NewLineNum!.Value);

            var newNums = hunk.Lines.Where(l => l.NewLineNum.HasValue).Select(l => l.NewLineNum!.Value).ToList();
            if (newNums.Count > 0)
                ranges.Add((newNums.Min(), newNums.Max()));
        }

        return (addedLines, ranges);
    }

    private async Task BuildCrossFileEdgesAsync(MrGraph graph)
    {
        foreach (var file in graph.Files)
        {
            foreach (var dep in file.Dependencies)
            {
                var target = FindChangedFileByImplName(dep.InterfaceName, file.Id, graph);
                if (target is not null)
                {
                    graph.Edges.Add(new MrEdge
                    {
                        FromFileId    = file.Id,
                        ToFileId      = target.Id,
                        InterfaceName = dep.InterfaceName,
                        ParamName     = dep.ParamName,
                        Type          = "di"
                    });
                }
            }

            foreach (var call in file.MethodCalls)
            {
                var target = FindChangedFileByImplName(call.TargetInterface, file.Id, graph);
                if (target is null) continue;

                var label    = $"{call.FromMethod}() -> {call.CalledMethod}()";
                var existing = graph.Edges.FirstOrDefault(e => e.FromFileId == file.Id && e.ToFileId == target.Id);

                if (existing is not null)
                {
                    if (!existing.MethodCalls.Contains(label))
                        existing.MethodCalls.Add(label);
                }
                else
                {
                    var edge = new MrEdge
                    {
                        FromFileId    = file.Id,
                        ToFileId      = target.Id,
                        InterfaceName = call.TargetInterface,
                        Type          = "calls"
                    };
                    edge.MethodCalls.Add(label);
                    graph.Edges.Add(edge);
                }
            }
        }

        await ResolveDependenciesToUnchangedFilesAsync(graph);
        BuildClassEdges(graph);
    }

    private static void BuildClassEdges(MrGraph graph)
    {
        var classById = graph.ClassNodes.ToDictionary(c => c.Id);
        var classesByName = graph.ClassNodes.ToLookup(c => c.ClassName);
        var interfaceImplementors = new Dictionary<string, List<MrClassNode>>();

        foreach (var cn in graph.ClassNodes.Where(c => !c.IsInterface))
        {
            foreach (var iface in cn.Interfaces)
            {
                if (!interfaceImplementors.ContainsKey(iface))
                    interfaceImplementors[iface] = [];
                interfaceImplementors[iface].Add(cn);
            }
        }

        foreach (var cn in graph.ClassNodes.Where(c => !c.IsInterface))
        {
            var parentFile = graph.Files.FirstOrDefault(f => f.Id == cn.FileId);
            if (parentFile is null) continue;

            foreach (var dep in parentFile.Dependencies)
            {
                var implName = GraphHelpers.StripInterfacePrefix(dep.InterfaceName);
                var targets = classesByName[implName].Where(t => t.Id != cn.Id).ToList();

                if (targets.Count == 0 && interfaceImplementors.TryGetValue(dep.InterfaceName, out var implementors))
                    targets = implementors.Where(t => t.Id != cn.Id).ToList();

                foreach (var target in targets)
                {
                    graph.ClassEdges.Add(new MrClassEdge
                    {
                        FromClassId   = cn.Id,
                        ToClassId     = target.Id,
                        Type          = target.IsChanged ? "di" : "di-ghost",
                        InterfaceName = dep.InterfaceName
                    });
                }
            }

            foreach (var call in parentFile.MethodCalls)
            {
                var implName = GraphHelpers.StripInterfacePrefix(call.TargetInterface);
                var targets = classesByName[implName].Where(t => t.Id != cn.Id).ToList();

                if (targets.Count == 0 && interfaceImplementors.TryGetValue(call.TargetInterface, out var implementors))
                    targets = implementors.Where(t => t.Id != cn.Id).ToList();

                foreach (var target in targets)
                {
                    var label = $"{call.FromMethod}() -> {call.CalledMethod}()";
                    var existing = graph.ClassEdges.FirstOrDefault(e =>
                        e.FromClassId == cn.Id && e.ToClassId == target.Id && e.Type == "calls");

                    if (existing is not null)
                    {
                        if (!existing.MethodCalls.Contains(label))
                            existing.MethodCalls.Add(label);
                    }
                    else
                    {
                        var edge = new MrClassEdge
                        {
                            FromClassId   = cn.Id,
                            ToClassId     = target.Id,
                            Type          = "calls",
                            InterfaceName = call.TargetInterface
                        };
                        edge.MethodCalls.Add(label);
                        graph.ClassEdges.Add(edge);
                    }
                }
            }

            foreach (var iface in cn.Interfaces)
            {
                var ifaceNodes = graph.ClassNodes
                    .Where(c => c.IsInterface && c.ClassName == iface)
                    .ToList();

                foreach (var ifaceNode in ifaceNodes)
                {
                    graph.ClassEdges.Add(new MrClassEdge
                    {
                        FromClassId   = cn.Id,
                        ToClassId     = ifaceNode.Id,
                        Type          = "implements",
                        InterfaceName = iface
                    });
                }
            }
        }
    }

    private static MrFileNode? FindChangedFileByImplName(string ifaceName, string excludeId, MrGraph graph)
    {
        var implName = GraphHelpers.StripInterfacePrefix(ifaceName);
        return graph.Files.FirstOrDefault(f =>
            f.FileName.Contains(implName, StringComparison.OrdinalIgnoreCase) && f.Id != excludeId);
    }

    private async Task ResolveDependenciesToUnchangedFilesAsync(MrGraph graph)
    {
        var changedFileIds = graph.Files.Select(f => f.Id).ToHashSet();

        var compilations = await Task.WhenAll(
            _solution.Projects.Select(async p => (Project: p, Compilation: await p.GetCompilationAsync()))
        );

        foreach (var file in graph.Files.ToList())
        {
            foreach (var dep in file.Dependencies)
            {
                if (graph.Edges.Any(e => e.FromFileId == file.Id && e.InterfaceName == dep.InterfaceName))
                    continue;

                TryAddGhostNode(file, dep, compilations, changedFileIds, graph);
            }
        }
    }

    private bool TryAddGhostNode(
        MrFileNode file,
        MrDependency dep,
        IEnumerable<(Project Project, Compilation? Compilation)> compilations,
        HashSet<string> changedFileIds,
        MrGraph graph)
    {
        var implName = GraphHelpers.StripInterfacePrefix(dep.InterfaceName);

        foreach (var (project, compilation) in compilations)
        {
            if (compilation is null) continue;

            foreach (var syntaxTree in compilation.SyntaxTrees)
            {
                if (syntaxTree.FilePath is null) continue;

                var fileName = Path.GetFileName(syntaxTree.FilePath);
                if (!fileName.Contains(implName, StringComparison.OrdinalIgnoreCase)) continue;

                var relativePath = Path.GetRelativePath(_solutionDir, syntaxTree.FilePath);
                var ghostId      = GraphHelpers.SanitizeId(relativePath);
                if (changedFileIds.Contains(ghostId)) continue;

                if (!graph.Files.Any(f => f.Id == ghostId))
                {
                    graph.Files.Add(new MrFileNode
                    {
                        Id          = ghostId,
                        FileName    = fileName,
                        FilePath    = relativePath,
                        IsChanged   = false,
                        FileType    = GraphHelpers.DetectFileType(relativePath),
                        ProjectName = project.Name
                    });

                    ExtractGhostClassNodes(syntaxTree, compilation, ghostId, project.Name, graph);
                }

                graph.Edges.Add(new MrEdge
                {
                    FromFileId    = file.Id,
                    ToFileId      = ghostId,
                    InterfaceName = dep.InterfaceName,
                    ParamName     = dep.ParamName,
                    Type          = "di-ghost"
                });
                return true;
            }

            if (graph.Edges.Any(e => e.FromFileId == file.Id && e.InterfaceName == dep.InterfaceName))
                return true;
        }

        return false;
    }

    private static void ExtractGhostClassNodes(SyntaxTree syntaxTree, Compilation compilation, string ghostFileId, string projectName, MrGraph graph)
    {
        var ghostRoot  = syntaxTree.GetRoot();
        var ghostModel = compilation.GetSemanticModel(syntaxTree);
        var ghostNs    = ghostRoot.DescendantNodes().OfType<BaseNamespaceDeclarationSyntax>().FirstOrDefault();
        var nsName     = ghostNs is not null ? ghostModel.GetDeclaredSymbol(ghostNs)?.ToDisplayString() : null;

        foreach (var cls in ghostRoot.DescendantNodes().OfType<ClassDeclarationSyntax>())
        {
            if (ghostModel.GetDeclaredSymbol(cls) is not INamedTypeSymbol sym) continue;

            var classNode = new MrClassNode
            {
                Id          = GraphHelpers.SanitizeId($"{projectName}/{sym.Name}"),
                ClassName   = sym.Name,
                Namespace   = nsName,
                FileId      = ghostFileId,
                ProjectName = projectName,
                IsChanged   = false,
                IsInterface = false
            };

            foreach (var iface in sym.AllInterfaces)
                classNode.Interfaces.Add(iface.Name);

            foreach (var method in cls.Members.OfType<MethodDeclarationSyntax>())
                classNode.Methods.Add(method.Identifier.Text);

            if (!graph.ClassNodes.Any(c => c.Id == classNode.Id))
                graph.ClassNodes.Add(classNode);
        }

        foreach (var iface in ghostRoot.DescendantNodes().OfType<InterfaceDeclarationSyntax>())
        {
            var sym = ghostModel.GetDeclaredSymbol(iface);
            if (sym is null) continue;

            var ifaceNode = new MrClassNode
            {
                Id          = GraphHelpers.SanitizeId($"{projectName}/{sym.Name}"),
                ClassName   = sym.Name,
                Namespace   = nsName,
                FileId      = ghostFileId,
                ProjectName = projectName,
                IsChanged   = false,
                IsInterface = true
            };

            foreach (var method in iface.Members.OfType<MethodDeclarationSyntax>())
                ifaceNode.Methods.Add(method.Identifier.Text);

            if (!graph.ClassNodes.Any(c => c.Id == ifaceNode.Id))
                graph.ClassNodes.Add(ifaceNode);
        }
    }

    private List<(string InterfaceName, string ParamName)> GetConstructorParams(ClassDeclarationSyntax cls, SemanticModel model)
    {
        var result = new List<(string, string)>();

        if (cls.ParameterList is not null)
            CollectInterfaceParams(cls.ParameterList.Parameters, model, result);

        foreach (var ctor in cls.Members.OfType<ConstructorDeclarationSyntax>())
        {
            if (ctor.ParameterList is not null)
                CollectInterfaceParams(ctor.ParameterList.Parameters, model, result);
        }

        return result;
    }

    private static void CollectInterfaceParams(
        IEnumerable<ParameterSyntax> parameters,
        SemanticModel model,
        List<(string InterfaceName, string ParamName)> result)
    {
        foreach (var param in parameters)
        {
            if (param.Type is null) continue;
            var typeInfo = model.GetTypeInfo(param.Type);
            if (typeInfo.Type?.TypeKind == TypeKind.Interface)
                result.Add((typeInfo.Type.Name, param.Identifier.Text));
        }
    }

    private static List<(string TargetInterface, string CalledMethod)> GetMethodCalls(MethodDeclarationSyntax method, SemanticModel model)
    {
        var result = new List<(string, string)>();
        foreach (var invocation in method.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            var symbol = model.GetSymbolInfo(invocation).Symbol;
            if (symbol?.ContainingType?.TypeKind == TypeKind.Interface)
                result.Add((symbol.ContainingType.Name, symbol.Name));
        }
        return result;
    }

    private Document? FindDocument(string relativePath)
    {
        var candidates = new[]
        {
            Path.GetFullPath(Path.Combine(_diffBaseDir, relativePath)),
            Path.GetFullPath(Path.Combine(_solutionDir, relativePath))
        };

        foreach (var project in _solution.Projects)
        {
            foreach (var fullPath in candidates)
            {
                var doc = project.Documents.FirstOrDefault(d =>
                    d.FilePath?.Equals(fullPath, StringComparison.OrdinalIgnoreCase) == true);
                if (doc is not null) return doc;
            }
        }
        return null;
    }

}
