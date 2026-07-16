# ADR-0011: Gateway-owned document upload and extraction

**Status:** Accepted

## Context
The original project blueprint assigns CPU-bound document handling to the .NET
Gateway: it accepts uploads, extracts text from PDFs and DOCX files with native
C# libraries, and sends a compressed, lightweight plain-text string to Python.
Until this phase, the application only accepted pasted JSON text, so that
architecture had not been implemented.

The agent service must remain independent of document formats. It continues to
receive only `jobId`, `text`, and `fileName`, regardless of whether the text was
pasted or extracted from an uploaded document.

## Options considered
1. Add multipart parsing and document extraction to the Python agent service —
   centralizes ingestion there, but violates the original separation of
   responsibilities and couples the agent to file formats.
2. Change `POST /api/jobs` to accept both JSON and multipart bodies — fewer
   routes, but risks changing the established JSON contract and its manual
   regression coverage for idempotency, checkpointing, and crash recovery.
3. Add a Gateway upload route, extract to text in .NET, and forward through the
   existing job-processing path.

## Decision
Option 3. `POST /api/jobs/upload` accepts multipart form data with a client
generated `jobId` and a `.txt`, `.pdf`, or `.docx` file. The Gateway extracts
text before calling the same idempotency, stale-resume, relay, and persistence
logic used by the unchanged JSON route.

`UglyToad.PdfPig` is used for PDF page text extraction. `DocumentFormat.OpenXml`
is used for DOCX extraction, iterating document paragraphs and inserting
newlines between them so paragraph boundaries survive the conversion.

Uploads are limited to 10 MB and checked against an extension allowlist. These
are basic ingestion hygiene only, not exhaustive file-safety controls: malware
scanning, OCR for scanned PDFs, and support for other document types are out of
scope for this decision.

## Consequences
Existing JSON callers and their regression history retain the same route and
payload contract. Upload callers receive the same SSE stream and terminal
idempotency behavior because both paths converge before the Python relay.

Python remains format-agnostic and handles plain text only. The Gateway now owns
the additional NuGet dependencies and is responsible for returning a clean 400
when a malformed or unsupported upload cannot be extracted.
