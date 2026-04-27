namespace CodeAtlas;

internal static class Defaults
{
    internal static readonly TimeSpan CommandTimeout = TimeSpan.FromSeconds(30);
    internal static readonly TimeSpan WorktreeTimeout = TimeSpan.FromSeconds(60);
    internal const string DefaultTargetBranch = "main";
    internal const string DiffFormat = "--unified=3";
}
