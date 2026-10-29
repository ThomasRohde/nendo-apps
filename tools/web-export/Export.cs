#:project HOST/src/Nendo.Session/Nendo.Session.csproj
#:package SkiaSharp@3.119.4
#:property PublishAot=false
// Exports each demo file the way Nendo's File → Web page… does: once as a single page, and once as
// a web app folder for a static site, using the host's own export code (NendoWebPageExport and
// NendoWebAppExport). tools/Build-WebPages.ps1 copies this file beside its output with HOST above
// replaced by the host checkout, so the export is always the host's. Prints one JSON line per file.
// Usage:
//   dotnet run Export.cs -- <runtime page.html> <sw.js> <pages folder> <site folder> <copy.nendo>...
using System.Text.Json;
using Nendo.Engine;
using Nendo.Session;
using SkiaSharp;

if (args.Length < 5)
{
    Console.Error.WriteLine("Usage: Export.cs <runtime page.html> <sw.js> <pages folder> <site folder> <copy.nendo>...");
    return 2;
}
var (template, worker, pages, site) = (args[0], args[1], args[2], args[3]);
Directory.CreateDirectory(pages);
Directory.CreateDirectory(site);

foreach (var copy in args[4..])
{
    var fileName = Path.GetFileName(copy);
    var name = Path.GetFileNameWithoutExtension(copy);
    var slug = name.ToLowerInvariant().Replace(' ', '-');
    await using var source = await NendoWriteCoordinator.OpenAsync(copy, "nendo-apps-web-export");
    var service = new NendoApplicationService(source);

    var page = Path.Combine(pages, name + ".html");
    await NendoWebPageExport.ExportAsync(service, fileName, template, page);

    // The icons are the file's own picture when it has one, else its tone and letter, as the
    // Desktop's Export → Web app draws them; the Nendo mark under the badge is left out here.
    var snapshot = await service.GetSnapshotAsync();
    var look = NendoLook.Resolve(snapshot.Manifest.ApplicationId, fileName, snapshot.Manifest.Look);
    byte[]? picture = null;
    if (look.Icon is { } icon && NendoMediaAddress.TryParse(icon, out var address) && address!.Sha256 is { } sha)
        picture = await service.ReadMediaContentAsync(sha);
    var icons = NendoWebAppExport.IconSizes.ToDictionary(size => size, size => DrawIcon(look, picture, size));
    var folder = Path.Combine(site, slug);
    if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true);
    Directory.CreateDirectory(folder);
    await NendoWebAppExport.ExportAsync(service, fileName, template, worker, icons, folder);

    Console.WriteLine(JsonSerializer.Serialize(new
    {
        name,
        slug,
        page = new FileInfo(page).Length,
        app = new FileInfo(Path.Combine(folder, "index.html")).Length,
        look.Tone,
        look.Letter,
        picture = picture is not null,
    }));
}
return 0;

static byte[] DrawIcon(NendoResolvedLook look, byte[]? picture, int size)
{
    using var surface = SKSurface.Create(new SKImageInfo(size, size, SKColorType.Rgba8888, SKAlphaType.Premul));
    var canvas = surface.Canvas;
    canvas.Clear(SKColors.Transparent);
    using var decoded = picture is null ? null : SKBitmap.Decode(picture);
    if (decoded is not null)
    {
        canvas.DrawBitmap(decoded, new SKRect(0, 0, size, size), new SKPaint { IsAntialias = true });
    }
    else
    {
        // The light theme's choice tones, as DesktopFileIcon.ToneColours holds them.
        var tone = look.Tone switch
        {
            "red" => 0xC93A3A, "orange" => 0xC75A17, "amber" => 0xA37608, "green" => 0x1F8A52,
            "teal" => 0x16837E, "blue" => 0x2F63D6, "violet" => 0x7446D4, _ => 0x677080,
        };
        using var fill = new SKPaint { IsAntialias = true, Color = new SKColor((uint)(0xFF000000 | tone)) };
        canvas.DrawRoundRect(new SKRect(0, 0, size, size), size * 0.22f, size * 0.22f, fill);
        using var typeface = SKTypeface.FromFamilyName("Segoe UI", SKFontStyle.Bold) ?? SKTypeface.Default;
        using var font = new SKFont(typeface, size * 0.56f);
        using var ink = new SKPaint { IsAntialias = true, Color = SKColors.White };
        font.MeasureText(look.Letter, out var bounds, ink);
        canvas.DrawText(look.Letter, size / 2f - bounds.MidX, size / 2f - bounds.MidY, SKTextAlign.Left, font, ink);
    }
    using var image = surface.Snapshot();
    using var png = image.Encode(SKEncodedImageFormat.Png, 100);
    return png.ToArray();
}
