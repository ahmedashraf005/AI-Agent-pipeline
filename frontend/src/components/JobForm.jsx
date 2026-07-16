import { useRef, useState } from 'react'

export default function JobForm({
  text,
  output,
  status,
  jobId,
  isSubmitting,
  file,
  onTextChange,
  onFileChange,
  onSubmit,
}) {
  const [fileError, setFileError] = useState('')
  const fileInputRef = useRef(null)
  const hasText = Boolean(text.trim())
  const hasFile = Boolean(file)
  const hasExactlyOneInput = hasText !== hasFile

  function handleTextChange(event) {
    if (file) {
      fileInputRef.current.value = ''
      onFileChange(null)
    }

    onTextChange(event.target.value)
  }

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] ?? null
    if (!nextFile) {
      setFileError('')
      onFileChange(null)
      return
    }

    const extension = nextFile.name.slice(nextFile.name.lastIndexOf('.')).toLowerCase()
    if (!['.txt', '.pdf', '.docx'].includes(extension)) {
      setFileError('Choose a .txt, .pdf, or .docx file.')
      event.target.value = ''
      onFileChange(null)
      return
    }

    setFileError('')
    onFileChange(nextFile)
  }

  return (
    <section className="job-form-card">
      <div className="section-heading">
        <span>Submit document</span>
        <span className="status-pill">{isSubmitting ? 'running' : 'ready'}</span>
      </div>

      <label className="field-label" htmlFor="document-text">
        Document text
      </label>
      <textarea
        id="document-text"
        value={text}
        onChange={handleTextChange}
        rows={7}
        className="document-input"
      />

      <label className="field-label" htmlFor="document-file">
        Or upload a document
      </label>
      <input
        ref={fileInputRef}
        id="document-file"
        type="file"
        accept=".txt,.pdf,.docx"
        onChange={handleFileChange}
      />
      {file && <div>Selected file: {file.name}</div>}
      {fileError && <div role="alert">{fileError}</div>}

      <div className="form-actions">
        <button className="primary-button" onClick={onSubmit} disabled={isSubmitting || !hasExactlyOneInput}>
          {isSubmitting ? 'Processing…' : 'Submit job'}
        </button>
      </div>

      <div className="live-status">
        <div>Status: {status}</div>
        {jobId && <div>Job ID: {jobId}</div>}
      </div>

      <pre className="output-panel">{output || 'Summary output will appear here.'}</pre>
    </section>
  )
}
