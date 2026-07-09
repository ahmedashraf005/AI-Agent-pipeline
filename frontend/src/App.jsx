import { useState } from 'react'

// WALKING SKELETON — Phase 0.
// No file upload UI yet, no auth, no polish. Just proves that a POST to the
// Gateway triggers an SSE stream that renders tokens live. Everything else
// (real upload, status badges, HITL review screen) is layered on later.

export default function App() {
  const [text, setText] = useState('The quarterly report is due Friday. All vendors must submit invoices by EOD.')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState('idle')

  async function submit() {
    setOutput('')
    setStatus('submitting')

    const res = await fetch('http://localhost:5001/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, fileName: 'manual-input.txt' }),
    })

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const event = JSON.parse(line.slice(6))

        if (event.type === 'token') setOutput((prev) => prev + event.content)
        if (event.type === 'status') setStatus(event.content)
        if (event.type === 'error') setStatus(`Error: ${event.content}`)
      }
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 600, margin: '40px auto' }}>
      <h2>Agent Pipeline — Walking Skeleton</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{ width: '100%' }}
      />
      <button onClick={submit} style={{ marginTop: 8 }}>
        Submit
      </button>
      <p>Status: {status}</p>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{output}</pre>
    </div>
  )
}
