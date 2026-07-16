const STAGES = ['Queued', 'Cache check', 'Drafting', 'Auditing', 'Fact check', 'Done']

function getStageIndex(status = '') {
  if (status.includes('Resuming from checkpoint')) return 0
  if (status.includes('Queued')) return 0
  if (status.includes('Cache')) return 1
  if (status.includes('Drafting')) return 2
  if (status.includes('Audit')) return 3
  if (status.includes('Fact check')) return 4
  if (status.includes('Completed') || status.includes('AwaitingReview') || status.includes('error')) return 5
  return 0
}

export default function PipelineStepper({ status }) {
  const stageIndex = getStageIndex(status)
  const isReview = status?.includes('AwaitingReview')

  return (
    <section className="pipeline-card" aria-label="Pipeline progress">
      <div className="section-heading">
        <span>Pipeline</span>
        <span className="status-pill">{status || 'idle'}</span>
      </div>
      <div className="pipeline-stepper">
        {STAGES.map((stage, index) => {
          const isFilled = index <= stageIndex
          const isFinalWarning = isReview && index === STAGES.length - 1
          return (
            <div className="pipeline-step" key={stage}>
              <div
                className={[
                  'pipeline-segment',
                  isFilled ? 'pipeline-segment-active' : '',
                  isFinalWarning ? 'pipeline-segment-warning' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
              <div className="pipeline-label">{stage}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
