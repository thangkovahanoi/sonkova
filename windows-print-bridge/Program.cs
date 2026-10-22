using System.Drawing;
using System.Drawing.Printing;
using System.Runtime.InteropServices;
using System.Text;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;
builder.WebHost.UseUrls(cfg["Urls"] ?? cfg["ListenUrl"] ?? "http://127.0.0.1:9100");
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);

var allowedOrigins = cfg.GetSection("AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(o => o.AddDefaultPolicy(policy =>
{
    policy.SetIsOriginAllowed(origin =>
    {
        if (string.IsNullOrWhiteSpace(origin)) return false;
        if (allowedOrigins.Any(x => string.Equals(x, origin, StringComparison.OrdinalIgnoreCase))) return true;
        // Keep the local development experience convenient while remaining localhost-only by default.
        if (Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
            string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase) &&
            (uri.Scheme == "http" || uri.Scheme == "https")) return true;
        if (Uri.TryCreate(origin, UriKind.Absolute, out uri) &&
            string.Equals(uri.Host, "127.0.0.1", StringComparison.OrdinalIgnoreCase) &&
            (uri.Scheme == "http" || uri.Scheme == "https")) return true;
        return false;
    }).AllowAnyHeader().AllowAnyMethod();
}));

var app = builder.Build();
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json; charset=utf-8";
        var message = feature?.Error?.Message ?? "Lỗi Print Bridge không xác định.";
        await context.Response.WriteAsJsonAsync(new { ok = false, error = message });
    });
});
app.UseCors();

var defaultPrinter = cfg["PrinterName"] ?? "XP-N160I";

app.MapGet("/health", () => Results.Ok(new { ok = true, printer = defaultPrinter, machine = Environment.MachineName, version = "V5-local-bridge" }));
app.MapGet("/printers", () => Results.Ok(WindowsPrinters.List()));
app.MapGet("/printer-status", (string? printerName) =>
{
    var printer = string.IsNullOrWhiteSpace(printerName) ? defaultPrinter : printerName.Trim();
    var exists = WindowsPrinters.Exists(printer);
    return Results.Ok(new { printer, exists, defaultPrinter });
});

app.MapPost("/print/test", (PrintTestRequest body) =>
{
    var printer = ResolvePrinter(body.PrinterName);
    var mode = ParseMode(body.Mode);
    if (mode == PrintMode.A4)
        A4Printer.Test(printer);
    else
        RawPrinter.Send(printer, EscPos.TestPage());
    return Results.Ok(new { ok = true, printer, mode = mode.ToString().ToLowerInvariant() });
});

app.MapPost("/print/raw", async (HttpRequest request) =>
{
    var printer = request.Query["printerName"].FirstOrDefault() ?? defaultPrinter;
    using var ms = new MemoryStream();
    await request.Body.CopyToAsync(ms);
    RawPrinter.Send(printer, ms.ToArray());
    return Results.Ok(new { ok = true, printer, bytes = ms.Length });
});

app.MapPost("/print/receipt", (ReceiptRequest body) =>
{
    var printer = ResolvePrinter(body.PrinterName);
    var mode = ParseMode(body.Mode);
    if (mode == PrintMode.A4)
    {
        A4Printer.PrintReceipt(printer, body);
    }
    else
    {
        var bytes = EscPos.Receipt(body.Title ?? "PHIẾU KHO", body.Items ?? [], body.PaymentMethod, body.PaymentBank, body.PaymentAccount, body.PaymentAccountName, body.PaymentInfo, body);
        RawPrinter.Send(printer, bytes);
    }
    return Results.Ok(new { ok = true, printer, mode = mode.ToString().ToLowerInvariant() });
});

app.MapPost("/print/label", (LabelRequest body) =>
{
    var printer = ResolvePrinter(body.PrinterName);
    var copies = Math.Clamp(body.Copies, 1, 100);
    var bytes = EscPos.Label(body.Name ?? "SẢN PHẨM", body.Sku ?? "", body.Barcode, body.Price, copies);
    RawPrinter.Send(printer, bytes);
    return Results.Ok(new { ok = true, printer, copies });
});

app.Run();

string ResolvePrinter(string? requested)
{
    var printer = string.IsNullOrWhiteSpace(requested) ? defaultPrinter : requested.Trim();
    if (!WindowsPrinters.Exists(printer))
        throw new InvalidOperationException($"Không tìm thấy máy in Windows '{printer}'. Hãy vào Cài đặt → Máy in để chọn lại.");
    return printer;
}

static PrintMode ParseMode(string? value) =>
    string.Equals(value, "a4", StringComparison.OrdinalIgnoreCase) ? PrintMode.A4 : PrintMode.Thermal;

enum PrintMode { Thermal, A4 }

public record PrintTestRequest(string? PrinterName, string? Mode);
public record ReceiptRequest(string? Title, List<ReceiptItem>? Items, string? PrintedAt, string? PaymentMethod, string? PaymentBank, string? PaymentAccount, string? PaymentAccountName, string? PaymentInfo, string? PrinterName, string? Mode, string? InvoiceNo=null, decimal? Subtotal=null, decimal? Discount=null, decimal? Total=null, string? QrData=null, string? QrImageData=null, InvoiceTemplate? Template=null);
public record LabelRequest(string? Name, string? Sku, string? Barcode, decimal? Price, int Copies = 1, string? PrinterName = null);
public record ReceiptItem(string Name, string? Sku, decimal Qty, decimal? UnitPrice);
public record InvoiceTemplate(string? StoreName=null,string? BusinessName=null,string? Phone=null,string? Title=null,string? Footer=null,bool ShowSku=true,bool ShowUnitPrice=true,bool ShowQty=true,bool ShowSubtotal=true,bool ShowDiscount=true,bool ShowPayment=true,bool ShowQr=true,int FontSize=12,string? Alignment="center",List<string>? Blocks=null);

static class WindowsPrinters
{
    public static object[] List()
    {
        var defaultName = new PrinterSettings().PrinterName;
        return PrinterSettings.InstalledPrinters.Cast<string>()
            .OrderBy(x => x, StringComparer.CurrentCultureIgnoreCase)
            .Select(name => new { name, isDefault = string.Equals(name, defaultName, StringComparison.OrdinalIgnoreCase) })
            .Cast<object>()
            .ToArray();
    }

    public static bool Exists(string name) =>
        PrinterSettings.InstalledPrinters.Cast<string>().Any(x => string.Equals(x, name, StringComparison.OrdinalIgnoreCase));
}

static class A4Printer
{
    public static void Test(string printerName)
    {
        using var doc = CreateDocument(printerName);
        doc.PrintPage += (_, e) =>
        {
            using var title = new Font("Arial", 20, FontStyle.Bold);
            using var body = new Font("Arial", 12);
            e.Graphics.DrawString("KHO XPRINTER", title, Brushes.Black, 70, 70);
            e.Graphics.DrawString("TEST PRINT - MAY IN A4", body, Brushes.Black, 70, 115);
            e.Graphics.DrawString($"Máy in: {printerName}", body, Brushes.Black, 70, 145);
            e.Graphics.DrawString(DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss"), body, Brushes.Black, 70, 175);
        };
        doc.Print();
    }

    public static void PrintReceipt(string printerName, ReceiptRequest body)
    {
        using var doc = CreateDocument(printerName);
        doc.PrintPage += (_, e) => DrawReceipt(e.Graphics, e.MarginBounds, body);
        doc.Print();
    }

    static PrintDocument CreateDocument(string printerName)
    {
        var doc = new PrintDocument { PrinterSettings = { PrinterName = printerName } };
        if (!doc.PrinterSettings.IsValid)
            throw new InvalidOperationException($"Máy in '{printerName}' không sẵn sàng.");
        // A4 = PaperSize.RawKind 9 on Windows drivers. If the driver does not expose A4,
        // keep its default paper size rather than failing the print job.
        var a4 = doc.PrinterSettings.PaperSizes.Cast<PaperSize>().FirstOrDefault(x => x.RawKind == 9 || x.PaperName.Contains("A4", StringComparison.OrdinalIgnoreCase));
        if (a4 != null) doc.DefaultPageSettings.PaperSize = a4;
        doc.DefaultPageSettings.Margins = new Margins(50, 50, 50, 50);
        return doc;
    }

    static void DrawReceipt(Graphics g, Rectangle bounds, ReceiptRequest body)
    {
        using var title = new Font("Arial", 18, FontStyle.Bold);
        using var h2 = new Font("Arial", 12, FontStyle.Bold);
        using var text = new Font("Arial", 10);
        using var small = new Font("Arial", 9);
        var y = bounds.Top;
        var x = bounds.Left;
        var right = bounds.Right;
        var fmt = new StringFormat { Alignment = StringAlignment.Near, Trimming = StringTrimming.EllipsisCharacter };

        g.DrawString("KHO XPRINTER", title, Brushes.Black, x, y); y += 32;
        g.DrawString(body.Title ?? "PHIẾU KHO", h2, Brushes.Black, x, y); y += 22;
        g.DrawString($"Thời gian: {body.PrintedAt ?? DateTime.Now.ToString("O")}", small, Brushes.Black, x, y); y += 25;
        g.DrawLine(Pens.Black, x, y, right, y); y += 12;

        foreach (var item in body.Items ?? [])
        {
            var line = $"{item.Name}    SL: {item.Qty:N0}";
            if (item.UnitPrice.HasValue) line += $"    ĐG: {item.UnitPrice.Value:N0} VND";
            g.DrawString(line, text, Brushes.Black, new RectangleF(x, y, bounds.Width, 22), fmt);
            y += 22;
            if (!string.IsNullOrWhiteSpace(item.Sku))
            {
                g.DrawString($"SKU: {item.Sku}", small, Brushes.Black, x + 15, y);
                y += 19;
            }
            if (y > bounds.Bottom - 120) break;
        }

        y += 8; g.DrawLine(Pens.Black, x, y, right, y); y += 14;
        if (!string.IsNullOrWhiteSpace(body.PaymentMethod))
        {
            g.DrawString("THANH TOÁN", h2, Brushes.Black, x, y); y += 23;
            g.DrawString($"Phương thức: {body.PaymentMethod}", text, Brushes.Black, x, y); y += 20;
            if (!string.IsNullOrWhiteSpace(body.PaymentBank)) { g.DrawString($"Ngân hàng: {body.PaymentBank}", text, Brushes.Black, x, y); y += 20; }
            if (!string.IsNullOrWhiteSpace(body.PaymentAccount)) { g.DrawString($"Số tài khoản: {body.PaymentAccount}", text, Brushes.Black, x, y); y += 20; }
            if (!string.IsNullOrWhiteSpace(body.PaymentAccountName)) { g.DrawString(body.PaymentAccountName, text, Brushes.Black, x, y); y += 20; }
            if (!string.IsNullOrWhiteSpace(body.PaymentInfo)) { g.DrawString(body.PaymentInfo, text, Brushes.Black, x, y); y += 20; }
        }
        g.DrawString("Cảm ơn quý khách!", h2, Brushes.Black, x, Math.Min(y + 20, bounds.Bottom - 30));
    }
}

static class EscPos
{
    // N160II is a thermal ESC/POS printer. Sending Vietnamese as UTF-8 bytes directly
    // is not reliable because the printer's active code page is not guaranteed to be UTF-8.
    // For invoices we therefore render the complete receipt as a monochrome bitmap on Windows
    // (Arial/Segoe UI supports Vietnamese) and send it as ESC/POS raster data. This also makes
    // QR, long account names and the footer print reliably without truncation.

    public static byte[] TestPage() =>
        Build(w =>
        {
            w.Write(new byte[] { 0x1B, 0x40 });
            var bmp = new Bitmap(576, 170);
            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.White);
                using var title = new Font("Arial", 20, FontStyle.Bold);
                using var body = new Font("Arial", 12);
                g.DrawString("KHO XPRINTER", title, Brushes.Black, 30, 25);
                g.DrawString("TEST PRINT", body, Brushes.Black, 30, 65);
                g.DrawString(DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss"), body, Brushes.Black, 30, 100);
            }
            WriteRaster(w, bmp);
            bmp.Dispose();
            FeedAndCut(w);
        });

    public static byte[] Label(string name, string sku, string? barcode, decimal? price, int copies) =>
        Build(w =>
        {
            w.Write(new byte[] { 0x1B, 0x40 });
            for (int i = 0; i < copies; i++)
            {
                // Labels are kept in ESC/POS text mode for compatibility with existing labels.
                Center(w, name);
                Center(w, sku);
                if (price.HasValue) Center(w, $"Gia: {price.Value:N0} VND");
                if (!string.IsNullOrWhiteSpace(barcode))
                {
                    w.Write(new byte[] { 0x1D, 0x68, 0x50 });
                    w.Write(new byte[] { 0x1D, 0x48, 0x02 });
                    var b = Encoding.ASCII.GetBytes("{B" + barcode);
                    w.Write(new byte[] { 0x1D, 0x6B, 0x49, (byte)b.Length });
                    w.Write(b);
                }
                w.Write(new byte[] { 0x0A, 0x0A });
            }
            FeedAndCut(w);
        });

    public static byte[] Receipt(string title, List<ReceiptItem> items, string? paymentMethod,
        string? paymentBank, string? paymentAccount, string? paymentAccountName, string? paymentInfo,
        ReceiptRequest body) =>
        Build(w =>
        {
            var t = body.Template ?? new InvoiceTemplate(Title: title);
            using var bmp = RenderReceipt(title, items, paymentMethod, paymentBank, paymentAccount,
                paymentAccountName, paymentInfo, body, t);
            w.Write(new byte[] { 0x1B, 0x40 });
            WriteRaster(w, bmp);
            // A little feed before cut guarantees the last footer/QR rows leave the print head.
            FeedAndCut(w);
        });

    static Bitmap RenderReceipt(string title, List<ReceiptItem> items, string? paymentMethod,
        string? paymentBank, string? paymentAccount, string? paymentAccountName, string? paymentInfo,
        ReceiptRequest body, InvoiceTemplate t)
    {
        const int width = 576; // 80mm at approx. 203dpi on N160II
        const int left = 18;
        const int right = width - 18;
        const int maxHeight = 14000;
        var bmp = new Bitmap(width, maxHeight, System.Drawing.Imaging.PixelFormat.Format24bppRgb);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.White);
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        float y = 16;
        var align = string.Equals(t.Alignment, "left", StringComparison.OrdinalIgnoreCase)
            ? StringAlignment.Near : StringAlignment.Center;
        int fs = Math.Clamp(t.FontSize, 14, 22);
        using var titleFont = new Font("Arial", fs + 3, FontStyle.Bold, GraphicsUnit.Pixel);
        using var headingFont = new Font("Arial", fs + 1, FontStyle.Bold, GraphicsUnit.Pixel);
        using var bodyFont = new Font("Arial", fs, FontStyle.Regular, GraphicsUnit.Pixel);
        using var smallFont = new Font("Arial", Math.Max(15, fs - 2), FontStyle.Regular, GraphicsUnit.Pixel);
        using var boldFont = new Font("Arial", fs, FontStyle.Bold, GraphicsUnit.Pixel);
        var sf = new StringFormat { Alignment = align, LineAlignment = StringAlignment.Near, Trimming = StringTrimming.Word };
        var leftSf = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Near, Trimming = StringTrimming.Word };

        void Line(float gap = 8)
        {
            using var pen = new Pen(Color.Black, 1);
            g.DrawLine(pen, left, y, right, y);
            y += gap + 5;
        }

        float Text(string? value, Font font, StringFormat format, float maxWidth = -1, float extra = 3)
        {
            if (string.IsNullOrWhiteSpace(value)) return 0;
            var w = maxWidth > 0 ? maxWidth : right - left;
            var rect = new RectangleF(left, y, w, 300);
            var size = g.MeasureString(value, font, new SizeF(w, 300), format);
            g.DrawString(value, font, Brushes.Black, rect, format);
            var h = Math.Max(font.GetHeight(g), size.Height);
            y += h + extra;
            return h;
        }

        void Center(string? value, Font font) => Text(value, font, sf);
        void LeftText(string? value, Font font) => Text(value, font, leftSf);

        void ItemText(string value)
        {
            LeftText(value, bodyFont);
        }

        var blocks = t.Blocks is { Count: > 0 }
            ? t.Blocks
            : new List<string> { "store", "title", "meta", "items", "totals", "payment", "qr", "footer" };

        foreach (var block in blocks)
        {
            switch (block)
            {
                case "store":
                    if (!string.IsNullOrWhiteSpace(t.StoreName)) Center(t.StoreName, headingFont);
                    if (!string.IsNullOrWhiteSpace(t.BusinessName)) Center(t.BusinessName, bodyFont);
                    if (!string.IsNullOrWhiteSpace(t.Phone)) Center(t.Phone, smallFont);
                    y += 4;
                    break;

                case "title":
                    Center(t.Title ?? title, titleFont);
                    y += 2;
                    break;

                case "meta":
                    if (!string.IsNullOrWhiteSpace(body.InvoiceNo)) Center($"Số HĐ: {body.InvoiceNo}", smallFont);
                    Center(body.PrintedAt != null && DateTime.TryParse(body.PrintedAt, out var printed)
                        ? printed.ToLocalTime().ToString("dd/MM/yyyy HH:mm")
                        : DateTime.Now.ToString("dd/MM/yyyy HH:mm"), smallFont);
                    y += 4;
                    break;

                case "customer":
                    // Customer data is not part of the current print payload; keep the block harmless.
                    break;

                case "items":
                {
                    Line();
                    // 80mm thermal layout: columns are arranged left-to-right as
                    // TÊN HÀNG | SL | ĐƠN GIÁ | THÀNH TIỀN.
                    // The old version printed each field on a separate line, which made
                    // the receipt unnecessarily tall and visually difficult to read.
                    const float tableWidth = 540f;
                    const float nameW = 245f;
                    const float qtyW = 45f;
                    const float unitW = 120f;
                    const float amountW = tableWidth - nameW - qtyW - unitW;
                    float tx = left;
                    using var tableHeaderFont = new Font("Arial", Math.Max(16, fs - 1), FontStyle.Bold, GraphicsUnit.Pixel);
                    using var itemNameFont = new Font("Arial", Math.Max(19, fs + 1), FontStyle.Regular, GraphicsUnit.Pixel);
                    using var itemSmallFont = new Font("Arial", Math.Max(16, fs - 2), FontStyle.Regular, GraphicsUnit.Pixel);
                    var centerSf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Near, Trimming = StringTrimming.EllipsisCharacter };
                    var rightSf = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Near, Trimming = StringTrimming.EllipsisCharacter };
                    var nameSf = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Near, Trimming = StringTrimming.Word };

                    g.DrawString("TÊN HÀNG", tableHeaderFont, Brushes.Black, new RectangleF(tx, y, nameW, 24), nameSf);
                    if (t.ShowQty) g.DrawString("SL", tableHeaderFont, Brushes.Black, new RectangleF(tx + nameW, y, qtyW, 24), centerSf);
                    if (t.ShowUnitPrice) g.DrawString("ĐƠN GIÁ", tableHeaderFont, Brushes.Black, new RectangleF(tx + nameW + qtyW, y, unitW, 24), rightSf);
                    g.DrawString("THÀNH TIỀN", tableHeaderFont, Brushes.Black, new RectangleF(tx + nameW + qtyW + unitW, y, amountW, 24), rightSf);
                    y += 25;
                    Line(3);

                    foreach (var x in items)
                    {
                        var amount = (x.UnitPrice ?? 0m) * x.Qty;
                        var nameText = x.Name ?? "";
                        if (t.ShowSku && !string.IsNullOrWhiteSpace(x.Sku))
                            nameText += $"\nSKU: {x.Sku}";

                        var nameSize = g.MeasureString(nameText, itemNameFont, new SizeF(nameW, 180), nameSf);
                        var rowH = Math.Max(25f, nameSize.Height + 2);
                        g.DrawString(nameText, itemNameFont, Brushes.Black, new RectangleF(tx, y, nameW, rowH), nameSf);
                        if (t.ShowQty)
                            g.DrawString(x.Qty.ToString("0.##"), itemNameFont, Brushes.Black, new RectangleF(tx + nameW, y, qtyW, rowH), centerSf);
                        if (t.ShowUnitPrice && x.UnitPrice.HasValue)
                            g.DrawString(x.UnitPrice.Value.ToString("N0"), itemNameFont, Brushes.Black, new RectangleF(tx + nameW + qtyW, y, unitW, rowH), rightSf);
                        g.DrawString(amount.ToString("N0"), itemNameFont, Brushes.Black, new RectangleF(tx + nameW + qtyW + unitW, y, amountW, rowH), rightSf);
                        y += rowH + 5;
                    }
                    break;
                }

                case "totals":
                    Line();
                    if (t.ShowSubtotal && body.Subtotal.HasValue) LeftText($"Tạm tính: {body.Subtotal.Value:N0} VND", bodyFont);
                    if (t.ShowDiscount && body.Discount.HasValue && body.Discount.Value > 0) LeftText($"Chiết khấu: -{body.Discount.Value:N0} VND", bodyFont);
                    if (body.Total.HasValue) LeftText($"TỔNG THANH TOÁN: {body.Total.Value:N0} VND", headingFont);
                    break;

                case "payment":
                    if (t.ShowPayment && !string.IsNullOrWhiteSpace(paymentMethod))
                    {
                        y += 5;
                        Center("THANH TOÁN", headingFont);
                        LeftText($"Phương thức: {paymentMethod}", bodyFont);
                        if (!string.IsNullOrWhiteSpace(paymentBank)) LeftText($"Ngân hàng: {paymentBank}", bodyFont);
                        if (!string.IsNullOrWhiteSpace(paymentAccount)) LeftText($"STK: {paymentAccount}", bodyFont);
                        if (!string.IsNullOrWhiteSpace(paymentAccountName)) LeftText(paymentAccountName, smallFont);
                        if (!string.IsNullOrWhiteSpace(paymentInfo)) LeftText(paymentInfo, smallFont);
                    }
                    break;

                case "qr":
                    if (t.ShowQr && (!string.IsNullOrWhiteSpace(body.QrImageData) || !string.IsNullOrWhiteSpace(body.QrData)))
                    {
                        y += 8;
                        try
                        {
                            using var qr = LoadQrImage(body);
                            var qrSize = Math.Min(250, right - left);
                            var qrX = left + ((right - left) - qrSize) / 2f;
                            g.DrawImage(qr, new RectangleF(qrX, y, qrSize, qrSize));
                            y += qrSize + 6;
                            Center("QUÉT MÃ ĐỂ THANH TOÁN", smallFont);
                            if (!string.IsNullOrWhiteSpace(body.InvoiceNo)) Center($"Nội dung: THANHTOAN {body.InvoiceNo}", smallFont);
                        }
                        catch
                        {
                            // QR is optional; a malformed image must never break the invoice print.
                        }
                    }
                    break;

                case "footer":
                    if (!string.IsNullOrWhiteSpace(t.Footer))
                    {
                        y += 8;
                        Center(t.Footer, bodyFont);
                    }
                    break;
            }
        }

        y += 18;
        var finalHeight = Math.Clamp((int)Math.Ceiling(y), 80, maxHeight);
        var cropped = new Bitmap(width, finalHeight, System.Drawing.Imaging.PixelFormat.Format24bppRgb);
        using (var cg = Graphics.FromImage(cropped))
        {
            cg.Clear(Color.White);
            cg.DrawImageUnscaled(bmp, 0, 0);
        }
        bmp.Dispose();
        return cropped;
    }

    static Bitmap LoadQrImage(ReceiptRequest body)
    {
        if (!string.IsNullOrWhiteSpace(body.QrImageData))
            return DecodeDataImage(body.QrImageData!);

        if (string.IsNullOrWhiteSpace(body.QrData))
            throw new InvalidOperationException("Thiếu dữ liệu QR.");

        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("KHO-XPRINTER-V5/1.0");
        var bytes = client.GetByteArrayAsync(body.QrData!).GetAwaiter().GetResult();
        using var ms = new MemoryStream(bytes);
        using var source = Image.FromStream(ms);
        return new Bitmap(source);
    }

    static Bitmap DecodeDataImage(string data)
    {
        var comma = data.IndexOf(',');
        if (comma < 0) throw new InvalidOperationException("QR image data không hợp lệ.");
        var raw = data[(comma + 1)..];
        var bytes = Convert.FromBase64String(raw);
        using var ms = new MemoryStream(bytes);
        using var source = Image.FromStream(ms);
        return new Bitmap(source);
    }

    static void WriteRaster(Stream s, Bitmap bitmap)
    {
        var widthBytes = (bitmap.Width + 7) / 8;
        var height = bitmap.Height;
        var data = new byte[widthBytes * height];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < bitmap.Width; x++)
            {
                var p = bitmap.GetPixel(x, y);
                var luminance = (0.299 * p.R) + (0.587 * p.G) + (0.114 * p.B);
                if (luminance < 180)
                    data[y * widthBytes + (x / 8)] |= (byte)(0x80 >> (x & 7));
            }
        }

        // GS v 0 — raster bit image, normal density.
        s.Write(new byte[]
        {
            0x1D, 0x76, 0x30, 0x00,
            (byte)(widthBytes & 0xFF), (byte)((widthBytes >> 8) & 0xFF),
            (byte)(height & 0xFF), (byte)((height >> 8) & 0xFF)
        });
        s.Write(data, 0, data.Length);
    }

    static void FeedAndCut(Stream s)
    {
        s.Write(new byte[] { 0x0A, 0x0A, 0x0A, 0x0A });
        s.Write(new byte[] { 0x1D, 0x56, 0x00 });
    }

    static byte[] Build(Action<MemoryStream> action)
    {
        using var m = new MemoryStream();
        action(m);
        return m.ToArray();
    }

    // Used only by the legacy label path. Invoice text is rasterized above.
    static void Text(Stream s, string text) => s.Write(Encoding.GetEncoding(437).GetBytes(text + "\n"));
    static void Center(Stream s, string text)
    {
        s.Write(new byte[] { 0x1B, 0x61, 0x01 });
        Text(s, text);
        s.Write(new byte[] { 0x1B, 0x61, 0x00 });
    }
}

static class RawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    class DOCINFO { public string pDocName="KHO XPRINTER"; public string pOutputFile=null!; public string pDataType="RAW"; }

    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool OpenPrinter(string pPrinterName, out nint phPrinter, nint pDefault);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(nint hPrinter);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] static extern int StartDocPrinter(nint hPrinter, int level, [In] DOCINFO di);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(nint hPrinter);
    [DllImport("winspool.drv", SetLastError=true)] static extern int StartPagePrinter(nint hPrinter);
    [DllImport("winspool.drv", SetLastError=true)] static extern int EndPagePrinter(nint hPrinter);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(nint hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    public static void Send(string printerName, byte[] data)
    {
        if(!OpenPrinter(printerName,out var h,nint.Zero)) throw new InvalidOperationException($"Không mở được máy in '{printerName}'. Win32={Marshal.GetLastWin32Error()}");
        try {
            var di=new DOCINFO();
            if(StartDocPrinter(h,1,di)==0) throw new InvalidOperationException("StartDocPrinter thất bại.");
            try {
                if(StartPagePrinter(h)==0) throw new InvalidOperationException("StartPagePrinter thất bại.");
                try {
                    if(!WritePrinter(h,data,data.Length,out var written) || written!=data.Length) throw new InvalidOperationException($"WritePrinter thất bại. Đã gửi {written}/{data.Length} bytes.");
                } finally { EndPagePrinter(h); }
            } finally { EndDocPrinter(h); }
        } finally { ClosePrinter(h); }
    }
}
