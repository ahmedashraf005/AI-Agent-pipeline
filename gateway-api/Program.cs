using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using GatewayApi.Data;
using GatewayApi.Models;
using GatewayApi.Services;
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

builder.Services.AddSingleton<DocumentTextExtractor>();
builder.Services.AddSingleton<InFlightJobBroadcaster>();

var app = builder.Build();
app.UseCors();

// POST /api/jobs  { "jobId": "...", "text": "...", "fileName": "..." }
// Streams Server-Sent Events straight through from the Python agent service.
app.MapPost("/api/jobs", (
    HttpContext ctx,
    JobRequest req,
    IHttpClientFactory httpFactory,
    AppDbContext db,
    InFlightJobBroadcaster broadcaster,
    ILogger<Program> logger) =>
    ProcessJobAsync(
        ctx,
        req.JobId,
        req.Text,
        req.FileName,
        req.OutputFormat,
        req.OutputLanguage,
        db,
        httpFactory,
        broadcaster,
        logger));

app.MapPost("/api/jobs/upload", async (
    HttpContext ctx,
    DocumentTextExtractor textExtractor,
    IHttpClientFactory httpFactory,
    AppDbContext db,
    InFlightJobBroadcaster broadcaster,
    ILogger<Program> logger) =>
{
    if (!ctx.Request.HasFormContentType)
    {
        return Results.BadRequest(new { message = "Upload requests must use multipart/form-data." });
    }

    IFormCollection form;
    try
    {
        form = await ctx.Request.ReadFormAsync(ctx.RequestAborted);
    }
    catch (Exception exc)
    {
        logger.LogWarning(exc, "Unable to read job upload form data");
        return Results.BadRequest(new { message = "The uploaded form data could not be read." });
    }

    var file = form.Files.GetFile("file");
    if (file is null || file.Length == 0)
    {
        return Results.BadRequest(new { message = "A non-empty file field is required." });
    }

    const long maxUploadSizeBytes = 10 * 1024 * 1024;
    if (file.Length > maxUploadSizeBytes)
    {
        return Results.BadRequest(new { message = "Uploaded files must be 10 MB or smaller." });
    }

    var extension = Path.GetExtension(file.FileName);
    var documentType = extension.ToLowerInvariant() switch
    {
        ".txt" => DocumentType.Text,
        ".pdf" => DocumentType.Pdf,
        ".docx" => DocumentType.Docx,
        _ => (DocumentType?)null
    };

    if (documentType is null)
    {
        return Results.BadRequest(new { message = "Only .txt, .pdf, and .docx files are supported." });
    }

    Guid? jobId = null;
    var jobIdValue = form["jobId"].FirstOrDefault();
    if (!string.IsNullOrWhiteSpace(jobIdValue))
    {
        if (!Guid.TryParse(jobIdValue, out var parsedJobId))
        {
            return Results.BadRequest(new { message = "jobId must be a valid UUID." });
        }

        jobId = parsedJobId;
    }

    var outputFormat = form["outputFormat"].FirstOrDefault();
    var outputLanguage = form["outputLanguage"].FirstOrDefault();

    string text;
    try
    {
        await using var stream = file.OpenReadStream();
        text = await textExtractor.ExtractAsync(stream, documentType.Value, ctx.RequestAborted);
    }
    catch (Exception exc)
    {
        logger.LogWarning(exc, "Unable to extract text from uploaded file {FileName}", file.FileName);
        return Results.BadRequest(new { message = "The uploaded file could not be read as a valid document." });
    }

    return await ProcessJobAsync(
        ctx,
        jobId,
        text,
        file.FileName,
        outputFormat,
        outputLanguage,
        db,
        httpFactory,
        broadcaster,
        logger);
});

app.MapGet("/api/jobs/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var job = await db.JobProcessingLogs.FindAsync(id);
    return job is null ? Results.NotFound() : Results.Ok(job);
});

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

static async Task<IResult> ProcessJobAsync(
    HttpContext ctx,
    Guid? requestedJobId,
    string text,
    string fileName,
    string? outputFormat,
    string? outputLanguage,
    AppDbContext db,
    IHttpClientFactory httpFactory,
    InFlightJobBroadcaster broadcaster,
    ILogger logger)
{
    const int staleJobThresholdSeconds = 30;
    var jobId = requestedJobId ?? Guid.NewGuid();
    var now = DateTime.UtcNow;
    var existingJob = await db.JobProcessingLogs.FindAsync(jobId);

    async Task<(IResult? Result, JobProcessingLog? JobLog)> HandleExistingJobAsync(
        JobProcessingLog job)
    {
        var checkedAt = DateTime.UtcNow;

        if (IsTerminal(job.Status))
        {
            logger.LogInformation(
                "Job {JobId} received, status={Status}",
                jobId,
                "duplicate-terminal");

            ctx.Response.Headers["Content-Type"] = "text/event-stream";
            ctx.Response.Headers["Cache-Control"] = "no-cache";

            await WriteSseEvent(ctx, jobId, "status", job.Status.ToString());
            await WriteSseEvent(ctx, jobId, "token", job.FinalSummary ?? "");

            return (Results.Empty, null);
        }

        if (job.UpdatedAt > checkedAt.AddSeconds(-staleJobThresholdSeconds))
        {
            logger.LogInformation(
                "Job {JobId} received, status={Status}",
                jobId,
                "duplicate-in-flight");

            if (broadcaster.TrySubscribe(jobId, out var subscription))
            {
                return (await StreamCoalescedJobAsync(ctx, jobId, subscription!, logger), null);
            }

            return (Results.Conflict(new
            {
                jobId,
                status = job.Status.ToString(),
                message = "Job is already in progress, but no live stream is available on this Gateway instance."
            }), null);
        }

        logger.LogInformation(
            "Job {JobId} received, status={Status}",
            jobId,
            "duplicate-stale-resume");

        job.FileName = fileName;
        job.RawText = text;
        job.Status = JobStatus.Processing;
        job.UpdatedAt = checkedAt;
        await db.SaveChangesAsync();

        return (null, job);
    }

    JobProcessingLog jobLog;
    var registeredInBroadcaster = false;
    if (existingJob is not null)
    {
        var decision = await HandleExistingJobAsync(existingJob);
        if (decision.Result is not null)
        {
            return decision.Result;
        }

        jobLog = decision.JobLog!;
    }
    else
    {
        logger.LogInformation(
            "Job {JobId} received, status={Status}",
            jobId,
            "new");

        jobLog = new JobProcessingLog
        {
            JobId = jobId,
            FileName = fileName,
            Status = JobStatus.Pending,
            RawText = text,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.JobProcessingLogs.Add(jobLog);
        try
        {
            await db.SaveChangesAsync();
            registeredInBroadcaster = broadcaster.TryRegister(jobId);
        }
        catch (DbUpdateException exc)
        {
            logger.LogInformation(
                exc,
                "Job {JobId} insert lost race to a concurrent request; reloading winner row",
                jobId);

            db.Entry(jobLog).State = EntityState.Detached;

            var winningJob = await db.JobProcessingLogs.FindAsync(jobId);
            if (winningJob is null)
            {
                throw;
            }

            var decision = await HandleExistingJobAsync(winningJob);
            if (decision.Result is not null)
            {
                return decision.Result;
            }

            jobLog = decision.JobLog!;
        }
    }

    ctx.Response.Headers["Content-Type"] = "text/event-stream";
    ctx.Response.Headers["Cache-Control"] = "no-cache";

    var client = httpFactory.CreateClient("AgentService");

    var payload = JsonSerializer.Serialize(new
    {
        jobId = jobId.ToString(),
        text,
        fileName,
        output_format = outputFormat ?? "paragraph",
        output_language = outputLanguage ?? "en"
    });

    using var content = new StringContent(payload, Encoding.UTF8, "application/json");

    jobLog.Status = JobStatus.Processing;
    jobLog.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    JobStatus? explicitTerminalStatus = null;
    string? lastToken = null;
    string? explicitErrorMessage = null;
    int? lastIterationCount = null;
    string? lastCategory = null;

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

            TrackStreamChunk(
                line,
                ref explicitTerminalStatus,
                ref lastToken,
                ref explicitErrorMessage,
                ref lastIterationCount,
                ref lastCategory);

            if (lastIterationCount is not null)
            {
                jobLog.LoopIterations = lastIterationCount.Value;
            }

            if (lastCategory is not null)
            {
                jobLog.Category = lastCategory;
            }

            if (registeredInBroadcaster)
            {
                broadcaster.Publish(jobId, line);
            }

            await ctx.Response.WriteAsync(line + "\n");
            await ctx.Response.Body.FlushAsync();
        }
    }
    catch (Exception exc)
    {
        logger.LogWarning(
            exc,
            "Job {JobId} stream relay threw; finalization will use any explicit terminal signal seen",
            jobId);
    }

    if (explicitTerminalStatus is not null)
    {
        jobLog.Status = explicitTerminalStatus.Value;
        jobLog.FinalSummary = lastToken;
    }
    else if (explicitErrorMessage is not null)
    {
        jobLog.Status = JobStatus.Failed;
        jobLog.FinalSummary = explicitErrorMessage;
    }
    else
    {
        logger.LogInformation(
            "Job {JobId} stream ended without terminal status; status remains Processing",
            jobId);

        if (registeredInBroadcaster)
        {
            broadcaster.Complete(jobId);
        }

        return Results.Empty;
    }

    if (lastIterationCount is not null)
    {
        jobLog.LoopIterations = lastIterationCount.Value;
    }

    if (lastCategory is not null)
    {
        jobLog.Category = lastCategory;
    }

    jobLog.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    logger.LogInformation(
        "Job {JobId} final status persisted, finalStatus={FinalStatus}",
        jobId,
        jobLog.Status);

    if (registeredInBroadcaster)
    {
        broadcaster.Complete(jobId);
    }

    return Results.Empty;
}

static async Task<IResult> StreamCoalescedJobAsync(
    HttpContext ctx,
    Guid jobId,
    JobSubscription subscription,
    ILogger logger)
{
    using (subscription)
    {
        logger.LogInformation(
            "Job {JobId} duplicate attached to live in-flight SSE stream",
            jobId);

        ctx.Response.Headers["Content-Type"] = "text/event-stream";
        ctx.Response.Headers["Cache-Control"] = "no-cache";

        try
        {
            foreach (var line in subscription.BufferedLines)
            {
                await ctx.Response.WriteAsync(line + "\n", ctx.RequestAborted);
                await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
            }

            await foreach (var line in subscription.Reader.ReadAllAsync(ctx.RequestAborted))
            {
                await ctx.Response.WriteAsync(line + "\n", ctx.RequestAborted);
                await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
            }
        }
        catch (OperationCanceledException) when (ctx.RequestAborted.IsCancellationRequested)
        {
            logger.LogInformation(
                "Job {JobId} coalesced duplicate SSE stream disconnected",
                jobId);
        }
    }

    return Results.Empty;
}

static void TrackStreamChunk(
    string line,
    ref JobStatus? explicitTerminalStatus,
    ref string? lastToken,
    ref string? explicitErrorMessage,
    ref int? lastIterationCount,
    ref string? lastCategory)
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
            explicitTerminalStatus = chunk.Content switch
            {
                "Completed" => JobStatus.Completed,
                "AwaitingReview" => JobStatus.AwaitingReview,
                _ => explicitTerminalStatus
            };
        }
        else if (chunk?.Type.Equals("token", StringComparison.OrdinalIgnoreCase) == true)
        {
            lastToken = chunk.Content;
        }
        else if (chunk?.Type.Equals("error", StringComparison.OrdinalIgnoreCase) == true)
        {
            explicitErrorMessage = chunk.Content;
        }

        if (chunk?.IterationCount is not null)
        {
            lastIterationCount = chunk.IterationCount;
        }

        if (chunk?.Category is not null)
        {
            lastCategory = chunk.Category;
        }
    }
    catch (JsonException)
    {
        // Keep the relay tolerant of comments, keepalives, or malformed chunks.
    }
}

static bool IsTerminal(JobStatus status) =>
    status is JobStatus.Completed or JobStatus.AwaitingReview or JobStatus.Failed;

static async Task WriteSseEvent(
    HttpContext ctx,
    Guid jobId,
    string eventType,
    string content)
{
    var payload = JsonSerializer.Serialize(new
    {
        jobId = jobId.ToString(),
        type = eventType,
        content
    });

    await ctx.Response.WriteAsync($"data: {payload}\n\n");
    await ctx.Response.Body.FlushAsync();
}

record JobRequest(
    string Text,
    string FileName,
    Guid? JobId,
    string? OutputFormat,
    string? OutputLanguage);

record StreamChunk(string Type, string Content, int? IterationCount, string? Category);
