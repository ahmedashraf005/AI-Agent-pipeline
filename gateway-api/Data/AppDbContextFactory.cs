using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace GatewayApi.Data;

public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var currentDirectory = Directory.GetCurrentDirectory();
        var assemblyDirectory = Path.GetDirectoryName(typeof(AppDbContextFactory).Assembly.Location)
            ?? currentDirectory;

        var projectDirectoryCandidates = new[]
        {
            currentDirectory,
            Path.Combine(currentDirectory, "gateway-api"),
            assemblyDirectory
        };

        var projectDirectory = projectDirectoryCandidates.First(directory =>
            File.Exists(Path.Combine(directory, "appsettings.json")));

        var configuration = new ConfigurationBuilder()
            .SetBasePath(projectDirectory)
            .AddJsonFile("appsettings.json")
            .Build();

        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
        optionsBuilder.UseSqlServer(configuration.GetConnectionString("Default"));

        return new AppDbContext(optionsBuilder.Options);
    }
}
