namespace GatewayApi.Models;

// Mirrors docs/contracts/job-status-transitions.md exactly.
// If you add a value here, update that file in the same commit.
public enum JobStatus
{
    Pending,
    Processing,
    AwaitingReview,
    Completed,
    Failed
}

public class JobProcessingLog
{
    public Guid JobId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public JobStatus Status { get; set; }
    public string? RawText { get; set; }
    public string? FinalSummary { get; set; }
    public int LoopIterations { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
