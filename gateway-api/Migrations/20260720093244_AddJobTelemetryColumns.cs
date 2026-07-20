using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GatewayApi.Migrations
{
    /// <inheritdoc />
    public partial class AddJobTelemetryColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "CacheHit",
                table: "JobProcessingLogs",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NodeDurationsJson",
                table: "JobProcessingLogs",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CacheHit",
                table: "JobProcessingLogs");

            migrationBuilder.DropColumn(
                name: "NodeDurationsJson",
                table: "JobProcessingLogs");
        }
    }
}
