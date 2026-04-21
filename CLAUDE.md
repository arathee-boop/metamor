# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run the dev server (defaults to port 8787)
npm start
```

Required `.env` file in the project root:
```
ANTHROPIC_API_KEY=your_key_here
CLAUDE_MODEL=claude-3-5-sonnet-latest
CLAUDE_MAX_TOKENS=1600
CASE_MEMORY_MESSAGES=30
CASE_MEMORY_PROJECTS=50
PORT=8787
```

There are no tests or linting configured.

## Architecture

Metamor ("Morp") is a change-management web app. It has a thin **Node/Express backend** (`server.js`) that proxies to the Anthropic API, and a set of **plain HTML pages** served as static files from the same Express server.

### Backend (`server.js`)

Two distinct AI assistants, each with their own in-memory conversation store:

| Store | Assistant | Endpoints |
|---|---|---|
| `projectMemory` | Case-for-Change (`buildSystemPrompt`) | `/api/case-assistant`, `/api/case-assistant/history/:id`, `/api/case-assistant/memo` |
| `understandChangeMemory` | Understand-the-Change (`buildUnderstandChangeSystemPrompt`) | `/api/understand-change`, `/api/understand-change/history/:id`, `/api/understand-change/report` |

Both assistants share the same helper layer:
- `getProjectState / getProjectMessages / setProjectMessages / appendProjectMessage` — manage per-project message arrays in memory (no persistence; restarts clear all state)
- `toAnthropicMessages` — trims history to `CASE_CONTEXT_MESSAGES` (default 16) before sending to Claude
- `buildContentBlocks` — attaches uploaded files as Anthropic `document` blocks (text/json only; binary files are listed but not read)
- File uploads handled by `multer` with memory storage; max 6 files × 5 MB each

The `/memo` and `/report` endpoints regenerate a structured artifact from the full stored transcript, using a separate system prompt.

### Frontend pages

All HTML pages are self-contained (inline CSS, inline JS). They communicate with the backend via `fetch`. No bundler, no framework.

| Page | Purpose |
|---|---|
| `index.html` | Dashboard / landing (hardcoded demo data) |
| `new-project.html` | Start a new change project |
| `projects.html` | Projects list |
| `process-change.html` | Change-process workflow steps |
| `process-case-chat.html` | Chat UI wired to `/api/case-assistant` |
| `understand-change-chat.html` | Chat UI wired to `/api/understand-change` |
| `quick-support.html` | Quick-help assistant |
| `account.html` | Account/profile page |

Shared styles live in `styles.css` (global) and `app-pages.css` (app-specific pages). `index.html` embeds all its CSS inline.

### Design system

Defined in `METAMOR_SKILLS_PLAYBOOK.md`. Key points:
- **Fonts**: Nunito (headings/brand), Sora (body) — loaded from Google Fonts. The playbook also lists Cinzel/Inter/Space Grotesk for a darker aesthetic variant; current implementation uses Nunito/Sora.
- **Color tokens** (CSS custom properties on `:root`): `--bg`, `--accent` (#ff6b35 orange), `--accent2` (#4a90d9 blue), `--green` (#3cb97a), `--text`, `--border`, etc.
- **Mascot**: inline SVG alien characters used throughout; keep them stylistically consistent.
- **Spacing scale**: 4, 8, 12, 16, 24, 32, 48 px.

## UI/UX Expert Skills

When building or modifying any page, apply these standards as a UI/UX expert would:

### Layout & hierarchy
- One primary action per screen — make it visually dominant; everything else is secondary.
- Use the spacing scale (4, 8, 12, 16, 24, 32, 48 px) strictly; never use arbitrary offsets.
- Align elements to an implicit grid; avoid floating elements that break visual rhythm.

### Interaction design
- Every interactive element needs visible hover, focus, and active states — use CSS transitions (0.15–0.18s ease is the established pattern in this codebase).
- Dropdowns and modals must close on outside click and `Escape` key — see `index.html` for the reference implementation.
- Click/tap targets should be large enough to hit comfortably (minimum ~40px tall for list items).

### States to always handle
For any dynamic UI element, define all four states before shipping:
1. **Default** — normal resting appearance
2. **Empty** — no data yet; show a useful prompt, not a blank void
3. **Loading** — visual feedback while awaiting API response
4. **Success / Error** — clear, specific feedback; never silent failures

### Copy and labeling
- Labels should be action-oriented: "Generate Memo", "Start Project" — not "Submit" or "OK".
- Helper text should be one short, contextual sentence — no multi-line explanations inline.
- Section titles describe intent, not category: "What changed?" not "Changes".

### Accessibility
- All interactive elements need `aria-label` or visible text (see topbar nav pattern in `index.html`).
- `aria-expanded` must be toggled on disclosure widgets (dropdowns, accordions).
- Ensure color contrast meets WCAG AA — the established palette already does; don't introduce low-contrast custom colors.

### Visual consistency
- Alien mascot SVGs appear on every page — new screens should include a contextually appropriate alien.
- Don't mix icon styles; keep stroke weight and rounded geometry consistent.
- Border radius values in use: `--radius` (16px) for cards, `--radius-sm` (10px) for smaller elements, `999px` for pill/badge shapes.

## Change Management Skills

When generating change-management content or advising on a change initiative, apply these principles:

### Framing a case for change
- Always establish **Why Now** — urgency is what moves stakeholders from interested to committed.
- Structure arguments as: Context → Problem → Cost of Inaction → Proposed Change → Benefits → Risks.
- Quantify impact wherever possible; vague benefits ("improved efficiency") are unconvincing to executives.

### Stakeholder analysis
- Segment stakeholders by: impact level (high/medium/low) × readiness (resistant/neutral/supportive).
- For each segment, define what changes for them specifically — never describe impact in aggregate.
- Identify who has formal authority vs. informal influence; both matter for adoption.

### Readiness and risk
- Surface the top 3–5 adoption risks explicitly; unexpressed risks erode trust when they materialize.
- Distinguish between technical readiness (systems, process) and human readiness (skills, mindset, incentives).
- For every risk, pair a mitigation — unmitigated risks read as negligence, not honesty.

### Sustained adoption
- Behavior change requires reinforcement loops: training, manager reinforcement, and visible quick wins within the first 30 days.
- Define success metrics upfront (KPIs tied to the stated benefits), so progress is trackable.
- Plan for regression — identify who will monitor adoption and what triggers a re-intervention.

---

## Change Communication Skills

When drafting communications about change, apply these standards:

### Message architecture
- Lead with **what changes and why** — never bury the key message in context-setting.
- Separate communications by audience: executives need decisions and impact; frontline staff need "what does this mean for me on Monday."
- Each communication should have one primary message; secondary messages dilute retention.

### Tone and trust
- Acknowledge difficulty honestly — false positivity destroys credibility. Name the challenge, then pivot to support.
- Use plain language; jargon signals insider exclusion, not expertise.
- Write in active voice with named owners: "The operations team will migrate all accounts by June 1" not "Accounts will be migrated."

### Communication sequencing
- Inform leaders before their teams — no one should learn about a change from a peer before their manager.
- Time communications to when action is required, not when information is ready.
- Repeat the core message across multiple channels and moments; first exposure rarely drives behavior.

### Feedback and dialogue
- Every significant change communication should include a named channel for questions and a committed response time.
- Distinguish one-way announcements from two-way dialogue moments — both are necessary, but they serve different purposes.

---

## Management Consulting Presentation Skills

When structuring or writing consulting-grade presentations and documents:

### Slide and document logic
- Follow the **Pyramid Principle**: lead with the recommendation, then support it — never bury the conclusion.
- Every slide title should state the takeaway as a full sentence: "Q3 margin pressure requires accelerating cost reduction" not "Q3 Margins."
- End each section with a crisp "So what?" and a clear "Now what?" — recommendations without next steps are observations, not consulting.

### Story structure
1. **Context** — what is true today (shared ground with the audience)
2. **Complication** — what has changed or what tension exists
3. **Question** — what decision or answer is therefore needed
4. **Answer** — the recommendation
5. **Evidence** — supporting data, analysis, and logic
6. **Actions** — specific owners, milestones, and asks

### Executive readiness
- The first page/slide must orient a busy executive in under 30 seconds: situation, recommendation, ask.
- Surface trade-offs and assumptions explicitly — hiding them erodes trust when they surface in Q&A.
- Include a clear **ask** on every decision-oriented document: approval, resource, sign-off, or input needed.

### Data and evidence
- Every data point should support a specific claim — decorative charts reduce credibility.
- Label axes, define terms, and cite sources; ambiguity invites challenges that derail the main argument.
- Use comparisons (vs. prior period, vs. benchmark, vs. target) to give numbers meaning.

### Polish and formatting
- Parallel structure in all bullet lists — same grammatical form, same level of specificity.
- Maximum 5–6 bullets per slide; if you need more, the logic needs restructuring.
- Consistent heading hierarchy, spacing, and capitalization throughout — inconsistency signals carelessness.

---

## Graphic Designer Skills (Modern Taste)

When designing or refining visual elements, UI, or any output intended to look polished:

### Aesthetic direction
- Pursue **calm confidence**: generous whitespace, restrained color, deliberate typography — not visual noise.
- Modern ≠ trendy. Favor timeless over fashionable; avoid effects that will look dated in 18 months (excessive gradients, glassmorphism overuse, neon glow everywhere).
- Every design decision should have a reason; decoration for its own sake weakens the overall system.

### Typography
- Establish a clear type scale with at most 3 levels: display/headline, body, caption/label.
- Pair one personality font (Nunito for Morp's brand voice) with one neutral workhorse (Sora for readability).
- Use weight and size for hierarchy before reaching for color — color hierarchy is fragile across contexts.
- Tighten letter-spacing on large headlines (`letter-spacing: -0.5px` to `-1px`); loosen on all-caps labels.

### Color
- A functional palette has 3 layers: **neutral base** (backgrounds, borders), **semantic accents** (primary action, secondary action, success, warning, error), **brand moment** (used sparingly for identity).
- Never use pure black (`#000`) or pure white (`#fff`) for body text/backgrounds — they create harsh contrast and feel unfinished. This codebase uses `#1c1a17` and `#f9f8f5` correctly.
- Test every color combination for accessibility; a beautiful palette that fails contrast is unusable.

### Composition and layout
- Establish a visual entry point on every screen — the eye needs a place to land first.
- Use **proximity** to group related items and **separation** (space or dividers) to distinguish unrelated ones.
- Asymmetric layouts feel more dynamic than perfectly centered grids; use alignment, not symmetry, as the organizing principle.

### Iconography and illustration
- Inline SVG is preferred for icons and mascots in this codebase — keeps assets sharp at all sizes and styleable via CSS.
- Maintain consistent stroke weight and corner radius across all icons in a set.
- The Morp alien mascots are a core brand asset — new characters must match the established anatomy: ellipse body, antenna with dot, curved smile path, consistent eye style.

### Motion and interaction
- Animation should communicate state change, not entertain. Float animations (like the hero aliens on `index.html`) are brand moments — use them intentionally, not everywhere.
- Duration sweet spot for UI transitions: 100–200ms for micro-interactions, 200–350ms for layout shifts.
- Easing: `ease` or `ease-out` for elements entering the screen; `ease-in` for exits.

### PR workflow

Per `METAMOR_SKILLS_PLAYBOOK.md` section 6: implement changes first; only create/update a PR when the user explicitly says **"SPR"**.
