using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using GatewayApi.Data;
using GatewayApi.Models;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5173") // Vite dev server default
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddHttpClient("AgentService", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["AgentServiceBaseUrl"]!);
    client.Timeout = TimeSpan.FromSeconds(30); // hard timeout — see docs/adr for failure-mode rules
});

var app = builder.Build();
app.UseCors();

// POST /api/jobs  { "text": "..." , "fileName": "..." }
// Streams Server-Sent Events straight through from the Python agent service.
app.MapPost("/api/jobs", async (
    HttpContext ctx,
    JobRequest req,
    IHttpClientFactory httpFactory,
    AppDbContext db) =>
{
    var jobId = Guid.NewGuid();
    var now = DateTime.UtcNow;

    var jobLog = new JobProcessingLog
    {
        JobId = jobId,
        FileName = req.FileName,
        Status = JobStatus.Pending,
        RawText = req.Text,
        CreatedAt = now,
        UpdatedAt = now
    };

    db.JobProcessingLogs.Add(jobLog);
    await db.SaveChangesAsync();

    ctx.Response.Headers["Content-Type"] = "text/event-stream";
    ctx.Response.Headers["Cache-Control"] = "no-cache";

    var client = httpFactory.CreateClient("AgentService");

    var payload = JsonSerializer.Serialize(new
    {
        jobId = jobId.ToString(),
        text = req.Text,
        fileName = req.FileName
    });

    using var content = new StringContent(payload, Encoding.UTF8, "application/json");

    jobLog.Status = JobStatus.Processing;
    jobLog.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    string? lastStatus = null;
    string? lastToken = null;
    int? lastIterationCount = null;

    try
    {
        using var upstreamRequest = new HttpRequestMessage(HttpMethod.Post, "/process")
        {
            Content = content
        };

        using var upstreamResponse = await client.SendAsync(
            upstreamRequest, HttpCompletionOption.ResponseHeadersRead);

        await using var upstreamStream = await upstreamResponse.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(upstreamStream);

        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync();
            if (line is null) break;

            TrackStreamChunk(line, ref lastStatus, ref lastToken, ref lastIterationCount);

            if (lastIterationCount is not null)
            {
                jobLog.LoopIterations = lastIterationCount.Value;
            }

            await ctx.Response.WriteAsync(line + "\n");
            await ctx.Response.Body.FlushAsync();
        }

        jobLog.Status = MapFinalStatus(lastStatus);
        jobLog.FinalSummary = lastToken;
        if (lastIterationCount is not null)
        {
            jobLog.LoopIterations = lastIterationCount.Value;
        }

        jobLog.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
    catch
    {
        jobLog.Status = JobStatus.Failed;
        jobLog.FinalSummary = lastToken;
        if (lastIterationCount is not null)
        {
            jobLog.LoopIterations = lastIterationCount.Value;
        }

        jobLog.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        throw;
    }
});

app.MapGet("/api/jobs/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var job = await db.JobProcessingLogs.FindAsync(id);
    return job is null ? Results.NotFound() : Results.Ok(job);
});

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

static void TrackStreamChunk(
    string line,
    ref string? lastStatus,
    ref string? lastToken,
    ref int? lastIterationCount)
{
    const string dataPrefix = "data: ";
    if (!line.StartsWith(dataPrefix, StringComparison.Ordinal))
    {
        return;
    }

    var json = line[dataPrefix.Length..];

    try
    {
        var chunk = JsonSerializer.Deserialize<StreamChunk>(
            json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (chunk?.Type.Equals("status", StringComparison.OrdinalIgnoreCase) == true)
        {
            lastStatus = chunk.Content;
        }
        else if (chunk?.Type.Equals("token", StringComparison.OrdinalIgnoreCase) == true)
        {
            lastToken = chunk.Content;
        }

        if (chunk?.IterationCount is not null)
        {
            lastIterationCount = chunk.IterationCount;
        }
    }
    catch (JsonException)
    {
        // Keep the relay tolerant of comments, keepalives, or malformed chunks.
    }
}

static JobStatus MapFinalStatus(string? status) =>
    status switch
    {
        "Completed" => JobStatus.Completed,
        "AwaitingReview" => JobStatus.AwaitingReview,
        _ => JobStatus.Failed
    };

record JobRequest(string Text, string FileName);

record StreamChunk(string Type, string Content, int? IterationCount);
