function getBadgeClass(status = '') {
  if (status.includes('Completed')) return 'badge badge-success'
  if (status.includes('AwaitingReview')) return 'badge badge-warning'
  if (status.includes('Processing') || status.includes('Drafting') || status.includes('Audit')) return 'badge badge-info'
  if (status.includes('Failed') || status.includes('error') || status.includes('Error')) return 'badge badge-danger'
  return 'badge badge-muted'
}

function getBadgeLabel(status = '') {
  if (status.includes('Completed')) return 'Completed'
  if (status.includes('AwaitingReview')) return 'Awaiting review'
  if (status.includes('Failed')) return 'Failed'
  if (status.includes('error') || status.includes('Error')) return 'Error'
  if (status && status !== 'idle') return 'Processing'
  return 'Queued'
}

export default function RecentJobsPanel({ jobs }) {
  const recentJobs = jobs.slice(0, 5)

  return (
    <aside className="recent-jobs-card">
      <div className="section-heading">
        <span>Recent jobs</span>
        <span className="panel-count">{recentJobs.length}</span>
      </div>

      <div className="recent-jobs-list">
        {recentJobs.length === 0 ? (
          <div className="empty-state">No jobs submitted this session.</div>
        ) : (
          recentJobs.map((job) => (
            <div className="recent-job-row" key={job.id}>
              <div>
                <div className="job-title">{job.fileName}</div>
                <div className="job-subtitle">{job.id}</div>
              </div>
              <span className={getBadgeClass(job.status)}>{getBadgeLabel(job.status)}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
