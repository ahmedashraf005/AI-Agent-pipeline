import { useRef, useState } from 'react'

export default function JobForm({
  text,
  output,
  status,
  jobId,
  isSubmitting,
  file,
  outputFormat,
  outputLanguage,
  onTextChange,
  onFileChange,
  onOutputFormatChange,
  onOutputLanguageChange,
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
      <div className="file-upload-block">
        <input
          ref={fileInputRef}
          id="document-file"
          type="file"
          accept=".txt,.pdf,.docx"
          className="file-input"
          onChange={handleFileChange}
        />
        {file && <div className="file-selected">Selected file: {file.name}</div>}
        {fileError && (
          <div className="file-error" role="alert">
            {fileError}
          </div>
        )}
      </div>

      <fieldset className="format-fieldset">
        <legend className="field-label">Summary format</legend>
        <label className="format-option">
          <input
            type="radio"
            name="output-format"
            value="paragraph"
            checked={outputFormat === 'paragraph'}
            onChange={(event) => onOutputFormatChange(event.target.value)}
          />
          Paragraph
        </label>
        <label className="format-option">
          <input
            type="radio"
            name="output-format"
            value="bullets"
            checked={outputFormat === 'bullets'}
            onChange={(event) => onOutputFormatChange(event.target.value)}
          />
          Bullet points
        </label>
      </fieldset>

      <div className="language-block">
        <label className="field-label" id="language-toggle-label">
          Summary language
        </label>
        <div className="language-toggle" role="group" aria-labelledby="language-toggle-label">
          <button
            type="button"
            className={`language-toggle-option ${outputLanguage === 'en' ? 'is-active' : ''}`}
            aria-pressed={outputLanguage === 'en'}
            onClick={() => onOutputLanguageChange('en')}
          >
            English
          </button>
          <button
            type="button"
            className={`language-toggle-option ${outputLanguage === 'ar' ? 'is-active' : ''}`}
            aria-pressed={outputLanguage === 'ar'}
            onClick={() => onOutputLanguageChange('ar')}
          >
            Arabic
          </button>
          <span className="language-toggle-thumb" aria-hidden="true" data-position={outputLanguage} />
        </div>
      </div>

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
