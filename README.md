# metamor

## Claude-powered "Make Case for Change" assistant

This project now includes a lightweight Node backend for the Process Change case-assistant chat.

### 1) Set up environment

Create a `.env` file in the project root:

```env
ANTHROPIC_API_KEY=your_claude_api_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
PORT=8787
```

### 2) Install dependencies

```bash
npm install
```

### 3) Run the app

```bash
npm run dev
```

Then open:

- Home: `http://localhost:8787/index.html`
- Case assistant: `http://localhost:8787/process-case-chat.html`

### 4) What the assistant does

- Uses Claude API via backend endpoint `POST /api/case-assistant`
- Accepts:
  - a user message
  - optional file attachments (plain text, markdown, PDF)
- Responds as:
  - change-management scholar
  - PR and communication strategy expert

### 5) Notes

- File uploads are processed in-memory and are not persisted.
- For production, add auth, rate limits, audit logging, and secure storage if needed.
