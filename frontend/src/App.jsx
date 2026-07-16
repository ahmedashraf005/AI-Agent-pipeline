import { useState } from 'react'

import FloatingLines from './components/FloatingLines.jsx'
import JobForm from './components/JobForm.jsx'
import MetricsRow from './components/MetricsRow.jsx'
import PipelineStepper from './components/PipelineStepper.jsx'
import RecentJobsPanel from './components/RecentJobsPanel.jsx'
import StatsCharts from './components/StatsCharts.jsx'
import './App.css'

const FILE_NAME = 'manual-input.txt'

function isTerminalStatus(status) {
  return (
    status.includes('Completed') ||
    status.includes('AwaitingReview') ||
    status.includes('Failed') ||
    status.includes('error') ||
    status.includes('Error')
  )
}

function calculateMetrics(jobs) {
  const completedJobs = jobs.filter((job) => job.completedAt)
  const cacheHitCount = jobs.filter((job) => job.cacheHit).length
  const averageLatency =
    completedJobs.length === 0
      ? null
      : completedJobs.reduce((total, job) => total + (job.completedAt - job.submittedAt) / 1000, 0) /
        completedJobs.length

  return {
    jobsToday: jobs.length,
    cacheHitRate: jobs.length === 0 ? 0 : Math.round((cacheHitCount / jobs.length) * 100),
    avgLatency: averageLatency,
  }
}

export default function App() {
  const [text, setText] = useState(
    'The quarterly report is due Friday. All vendors must submit invoices by EOD.',
  )
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState('idle')
  const [jobId, setJobId] = useState('')
  const [jobs, setJobs] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [outputFormat, setOutputFormat] = useState('paragraph')
  const [outputLanguage, setOutputLanguage] = useState('en')

  const metrics = calculateMetrics(jobs)

  function updateJob(jobIdToUpdate, updater) {
    setJobs((currentJobs) =>
      currentJobs.map((job) => (job.id === jobIdToUpdate ? { ...job, ...updater(job) } : job)),
    )
  }

  function handleTextChange(nextText) {
    setText(nextText)
    if (nextText.trim()) {
      setSelectedFile(null)
    }
  }

  function handleFileChange(file) {
    setSelectedFile(file)
    if (file) {
      setText('')
    }
  }

  async function submit() {
    const nextJobId = crypto.randomUUID()
    const submittedAt = Date.now()

    setOutput('')
    setStatus('submitting')
    setJobId(nextJobId)
    setIsSubmitting(true)
    setJobs((currentJobs) => [
      {
        id: nextJobId,
        fileName: selectedFile?.name ?? FILE_NAME,
        status: 'submitting',
        submittedAt,
        completedAt: null,
        cacheHit: false,
      },
      ...currentJobs,
    ])

    try {
      let res
      if (selectedFile) {
        const formData = new FormData()
        formData.append('jobId', nextJobId)
        formData.append('file', selectedFile)
        formData.append('outputFormat', outputFormat)
        formData.append('outputLanguage', outputLanguage)

        res = await fetch('http://localhost:5001/api/jobs/upload', {
          method: 'POST',
          body: formData,
        })
      } else {
        res = await fetch('http://localhost:5001/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: nextJobId,
            text,
            fileName: FILE_NAME,
            outputFormat,
            outputLanguage,
          }),
        })
      }

      if (!res.ok) {
        const error = await res.json()
        const errorStatus = `Error: ${error.message ?? res.statusText}`
        setStatus(errorStatus)
        updateJob(nextJobId, () => ({
          status: errorStatus,
          completedAt: Date.now(),
        }))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const event = JSON.parse(line.slice(6))

          if (event.type === 'token') {
            setOutput((prev) => prev + event.content)
          }

          if (event.type === 'status') {
            const nextStatus = event.content
            const sawCacheHit = nextStatus.includes('Cache hit')
            setStatus(nextStatus)
            updateJob(nextJobId, (job) => ({
              status: nextStatus,
              cacheHit: job.cacheHit || sawCacheHit,
              completedAt: isTerminalStatus(nextStatus) ? job.completedAt ?? Date.now() : job.completedAt,
            }))
          }

          if (event.type === 'error') {
            const errorStatus = `error: ${event.content}`
            setStatus(errorStatus)
            updateJob(nextJobId, () => ({
              status: errorStatus,
              completedAt: Date.now(),
            }))
          }
        }
      }
    } catch (error) {
      const errorStatus = `error: ${error.message}`
      setStatus(errorStatus)
      updateJob(nextJobId, () => ({
        status: errorStatus,
        completedAt: Date.now(),
      }))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      {!window.matchMedia('(prefers-reduced-motion: reduce)').matches && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.35 }}>
          <FloatingLines
            enabledWaves={['top', 'middle', 'bottom']}
            lineCount={[3, 4, 3]}
            lineDistance={[10, 10, 10]}
            linesGradient={['#94a3b8', '#64748b']}
            animationSpeed={0.4}
            interactive={false}
            parallax={false}
            mixBlendMode="normal"
          />
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <main className="dashboard">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">Agent pipeline</p>
              <h1>Processing dashboard</h1>
            </div>
          </header>

          <MetricsRow
            jobsToday={metrics.jobsToday}
            cacheHitRate={metrics.cacheHitRate}
            avgLatency={metrics.avgLatency}
          />

          <div className="dashboard-grid">
            <div className="main-column">
              <PipelineStepper status={status} />
              <JobForm
                text={text}
                output={output}
                status={status}
                jobId={jobId}
                isSubmitting={isSubmitting}
                file={selectedFile}
                outputFormat={outputFormat}
                outputLanguage={outputLanguage}
                onTextChange={handleTextChange}
                onFileChange={handleFileChange}
                onOutputFormatChange={setOutputFormat}
                onOutputLanguageChange={setOutputLanguage}
                onSubmit={submit}
              />
            </div>
            <RecentJobsPanel jobs={jobs} />
          </div>

          <StatsCharts />
        </main>
      </div>
    </div>
  )
}
