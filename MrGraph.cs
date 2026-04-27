namespace CodeAtlas;

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
    public string RepoName { get; set; } = "";
    public int TotalFiles { get; set; }
    public int TotalAdditions { get; set; }
    public int TotalDeletions { get; set; }
    public CanvasConfig? Config { get; set; }
    public List<MrFileNode> Files { get; } = [];
    public List<MrEdge> Edges { get; } = [];
    public int SchemaVersion { get; set; } = 2;
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
    public string FileType { get; set; } = "other";
    public string ProjectName { get; set; } = "";
    public string? Namespace { get; set; }
    public int ImpactRadius { get; set; }
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
    public string DiffType { get; set; } = "context";
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
    public int CallOrder { get; set; }
}

public class MrEdge
{
    public string FromFileId { get; set; } = "";
    public string ToFileId { get; set; } = "";
    public string InterfaceName { get; set; } = "";
    public string? ParamName { get; set; }
    public string Type { get; set; } = "";
    public List<string> MethodCalls { get; } = [];
}
