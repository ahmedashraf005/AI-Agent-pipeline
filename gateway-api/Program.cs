// WALKING SKELETON — Phase 0.
// Purpose: prove every wire in the diagram connects end-to-end before any
// real feature (LangGraph loop, auditor, cache) is built on top of it.
// One hardcoded-ish request, one streamed response, nothing else.

using System.Net.Http;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

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
app.MapPost("/api/jobs", async (HttpContext ctx, JobRequest req, IHttpClientFactory httpFactory) =>
{
    var jobId = Guid.NewGuid();

    ctx.Response.Headers.Add("Content-Type", "text/event-stream");
    ctx.Response.Headers.Add("Cache-Control", "no-cache");

    var client = httpFactory.CreateClient("AgentService");

    var payload = JsonSerializer.Serialize(new
    {
        jobId = jobId.ToString(),
        text = req.Text,
        fileName = req.FileName
    });

    using var content = new StringContent(payload, Encoding.UTF8, "application/json");

    using var upstreamRequest = new HttpRequestMessage(HttpMethod.Post, "/process")
    {
        Content = content
    };

    using var upstreamResponse = await client.SendAsync(
        upstreamRequest, HttpCompletionOption.ResponseHeadersRead);

    await using var upstreamStream = await upstreamResponse.Content.ReadAsStreamAsync();
    using var reader = new StreamReader(upstreamStream);

    // Naive pass-through relay: forward each SSE line from Python straight to the
    // browser as it arrives. Real error/timeout handling belongs here later —
    // this is intentionally the thin, unfeatured version (see project plan
    // step 7: walking skeleton before real features).
    while (!reader.EndOfStream)
    {
        var line = await reader.ReadLineAsync();
        if (line is null) break;
        await ctx.Response.WriteAsync(line + "\n");
        await ctx.Response.Body.FlushAsync();
    }
});

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

record JobRequest(string Text, string FileName);
