using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using UglyToad.PdfPig;

namespace GatewayApi.Services;

public sealed class DocumentTextExtractor
{
    public async Task<string> ExtractAsync(
        Stream stream,
        DocumentType documentType,
        CancellationToken cancellationToken = default)
    {
        if (stream.CanSeek)
        {
            stream.Position = 0;
        }

        return documentType switch
        {
            DocumentType.Text => await ExtractTextFileAsync(stream, cancellationToken),
            DocumentType.Pdf => ExtractPdf(stream),
            DocumentType.Docx => ExtractDocx(stream),
            _ => throw new ArgumentOutOfRangeException(nameof(documentType), documentType, null)
        };
    }

    private static async Task<string> ExtractTextFileAsync(Stream stream, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(
            stream,
            new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true),
            detectEncodingFromByteOrderMarks: true,
            leaveOpen: true);

        return await reader.ReadToEndAsync(cancellationToken);
    }

    private static string ExtractPdf(Stream stream)
    {
        using var document = PdfDocument.Open(stream);
        var text = new StringBuilder();

        for (var pageNumber = 1; pageNumber <= document.NumberOfPages; pageNumber++)
        {
            if (pageNumber > 1)
            {
                text.AppendLine();
            }

            text.Append(document.GetPage(pageNumber).Text);
        }

        return text.ToString();
    }

    private static string ExtractDocx(Stream stream)
    {
        using var document = WordprocessingDocument.Open(stream, false);
        var body = document.MainDocumentPart?.Document?.Body;

        return body is null
            ? string.Empty
            : string.Join(Environment.NewLine, body.Descendants<Paragraph>().Select(paragraph => paragraph.InnerText));
    }
}

public enum DocumentType
{
    Text,
    Pdf,
    Docx
}
