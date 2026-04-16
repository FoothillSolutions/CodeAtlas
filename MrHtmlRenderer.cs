using System.Text.Encodings.Web;
using System.Text.Json;

namespace CodeAtlas;

public static class MrHtmlRenderer
{
    public static string Render(MrGraph graph)
    {
        var jsonOptions = new JsonSerializerOptions
        {
            WriteIndented = false,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            // Use default encoder: escapes < > & as \uXXXX to prevent </script> breakout
            Encoder = JavaScriptEncoder.Default
        };

        var graphJson = JsonSerializer.Serialize(graph, jsonOptions);
        var htmlTemplate = LoadHtmlTemplate();

        // Replace the empty placeholder with the data
        var placeholder = "<script id=\"graph-data\" type=\"application/json\"></script>";
        var dataScript = $"<script id=\"graph-data\" type=\"application/json\">{graphJson}</script>";

        return htmlTemplate.Replace(placeholder, dataScript);
    }

    private static string LoadHtmlTemplate()
    {
        // Try multiple locations to find the built HTML
        var candidates = new[]
        {
            // Relative to the assembly
            Path.Combine(AppContext.BaseDirectory, "canvas-ui", "dist", "index.html"),
            // Relative to the working directory
            Path.Combine(Directory.GetCurrentDirectory(), "canvas-ui", "dist", "index.html"),
            // Relative to the source (for development)
            FindSourceRelativePath()
        };

        foreach (var path in candidates.Where(p => p is not null))
        {
            if (File.Exists(path!))
            {
                return File.ReadAllText(path!);
            }
        }

        throw new FileNotFoundException(
            "Could not find canvas-ui/dist/index.html. Run 'npm run build' in the canvas-ui/ directory first.\n" +
            $"Searched: {string.Join(", ", candidates.Where(p => p is not null))}");
    }

    private static string? FindSourceRelativePath()
    {
        // Walk up from assembly location to find the canvas-ui dir
        var dir = AppContext.BaseDirectory;
        for (var i = 0; i < 8; i++)
        {
            var candidate = Path.Combine(dir, "canvas-ui", "dist", "index.html");
            if (File.Exists(candidate)) return candidate;
            var parent = Directory.GetParent(dir);
            if (parent is null) break;
            dir = parent.FullName;
        }
        return null;
    }
}
