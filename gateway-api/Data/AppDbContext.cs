using GatewayApi.Models;
using Microsoft.EntityFrameworkCore;

namespace GatewayApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<JobProcessingLog> JobProcessingLogs => Set<JobProcessingLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<JobProcessingLog>(entity =>
        {
            entity.HasKey(job => job.JobId);
            entity.Property(job => job.Status).HasConversion<string>();
        });
    }
}
