# metamor

## Claude-powered "Make Case for Change" assistant

This project now includes a lightweight Node backend for the Process Change case-assistant chat.

### 1) Set up environment

Create a `.env` file in the project root:

```env
ANTHROPIC_API_KEY=your_claude_api_key_here
CLAUDE_MODEL=claude-3-5-sonnet-latest
CLAUDE_MAX_TOKENS=1600
CASE_MEMORY_MESSAGES=30
CASE_MEMORY_PROJECTS=50
PORT=8787
```

### 2) Install dependencies

```bash
npm install
```

### 3) Run the app

```bash
npm start
```

Then open:

- Home: `http://localhost:8787/index.html`
- Case assistant: `http://localhost:8787/process-case-chat.html`

### 4) What the assistant does

- Uses Claude API via backend endpoint `POST /api/case-assistant`
- Accepts:
  - a user message
  - optional file attachments (text/json are parsed and summarized; all selected files are listed in context)
- Responds as:
  - change-management scholar
  - PR and communication strategy expert

### 5) New capabilities added

- **Project-based conversation memory**
  - Each project ID has its own memory thread.
  - API:
    - `GET /api/case-assistant/history/:projectId`
    - `DELETE /api/case-assistant/history/:projectId`
- **Executive memo generation**
  - API: `POST /api/case-assistant/memo`
  - Uses saved project conversation and returns:
    - one-page executive memo (markdown)
    - slide-ready outline (markdown)
- **Downloadable outputs**
  - In `process-case-chat.html`, generated memo and slide outline can each be downloaded as `.md`.

### 6) Notes

- File uploads are processed in-memory and are not persisted.
- For production, add auth, rate limits, audit logging, and secure storage if needed.
