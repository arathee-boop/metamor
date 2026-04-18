# Metamor Skills Playbook

This playbook defines how Metamor work should be designed, structured, and reviewed across product UI, visual communication, and presentation deliverables.

Use this as the default standard for:
- product pages and flows
- UI polish and interaction behavior
- consulting-style narratives and decks
- formatting and quality control

---

## 1) Graphic Design Standards

### 1.1 Visual direction
- Maintain an interstellar, dark, minimal aesthetic.
- Use restrained glow effects; avoid visual clutter.
- Keep one clear focal point per screen section.

### 1.2 Typography
- Headline/display: `Cinzel`
- Body/supporting text: `Inter`
- Microcopy/technical/support labels: `Space Grotesk`
- Keep body text readable; avoid overly dense paragraphs.

### 1.3 Color discipline
- Base: deep navy/space backgrounds
- Accents: cool blue/cyan highlights
- Bright accents (for action/attention) should be used sparingly.
- Ensure sufficient contrast between text and background.

### 1.4 Spacing and composition
- Use consistent spacing scale: `4, 8, 12, 16, 24, 32, 48`.
- Align to a visible grid; no arbitrary offsets.
- Preserve generous white space around critical actions.

### 1.5 Icons and imagery
- Keep icon style consistent in stroke weight and rounded geometry.
- Themed icon sets (e.g., alien mascot icons) should remain coherent across all cards.
- Avoid mixing unrelated icon styles on the same screen.

---

## 2) UI/UX Design Standards

### 2.1 Flow clarity
- Every page should have one primary objective and one primary CTA.
- Keep critical paths short and obvious.
- Label actions with plain, user-focused wording.

### 2.2 Navigation and IA
- Back links should always be available for template/detail screens.
- Section titles should describe intent, not just category.
- Keep naming consistent across all pages and states.

### 2.3 Interaction behavior
- Hover/focus states must be visible and consistent.
- Click targets should be large enough and easy to scan.
- Dropdowns/modals should close predictably (outside click / escape).

### 2.4 UX content standards
- Use short, concrete phrases over abstract language.
- Prefer action-oriented labels (e.g., "Use Template", "Open Assistant").
- Keep helper text concise and contextual.

### 2.5 State handling requirements
- For each flow, define at least:
  - default state
  - empty state
  - loading state
  - success/error feedback

---

## 3) Consulting Presentation Standards

### 3.1 Story structure
For strategy slides/docs, follow:
1. Context
2. Problem
3. Insight
4. Recommendation
5. Expected impact
6. Next actions

### 3.2 Message discipline
- One core idea per slide/page.
- Title must state the takeaway, not a generic topic.
- End each section with "So what?" and "Now what?"

### 3.3 Executive readiness
- Prioritize decision-enabling content.
- Highlight risks, dependencies, and trade-offs.
- Include explicit asks (approval, resources, owners, timeline).

### 3.4 Visual standards for decks/docs
- Consistent heading hierarchy and spacing.
- Minimal text blocks; use bullets with parallel structure.
- Charts/diagrams must support decisions, not decoration.

---

## 4) Formatting Standards

### 4.1 Document hygiene
- Consistent capitalization style.
- Parallel bullet grammar and punctuation.
- No mixed date/time/number formats within one artifact.

### 4.2 Layout consistency
- Standardize:
  - heading sizes
  - card paddings
  - icon sizes
  - button radii
  - line heights

### 4.3 Readability
- Keep line length comfortable for scanning.
- Avoid wall-of-text paragraphs.
- Use section breaks and subheadings to segment content.

### 4.4 Final polish pass
Before delivery, validate:
- alignment
- spacing consistency
- wording clarity
- grammar/spelling
- visual balance

---

## 5) Reusable Quality Checklist (Definition of Done)

Use this checklist for all Metamor deliverables:

### Design
- [ ] Clear visual hierarchy
- [ ] Consistent style with brand direction
- [ ] Spacing follows scale system

### UX
- [ ] Primary action is obvious
- [ ] Navigation paths are intuitive
- [ ] Interactive states are visible and accessible

### Content
- [ ] Copy is concise and specific
- [ ] Labels are action-driven
- [ ] No ambiguous instructions

### Presentation/Consulting
- [ ] Problem and recommendation are explicit
- [ ] Implications and actions are clear
- [ ] Audience can make decisions from output

### Formatting
- [ ] Alignment and typography are consistent
- [ ] No inconsistent styles or orphaned elements
- [ ] Final proofread completed

---

## 6) Working Rule for Agent Workflow

Current team preference:
- Implement requested changes first.
- Create/update PR only when user explicitly says: **"SPR"**.

---

## 7) Suggested Next Extensions

Future additions to this playbook:
- Design token table (exact values for colors, radii, shadows, font sizes)
- Component specs (buttons, cards, flow steps, chat bubbles)
- Voice and tone guide for in-product assistant prompts
- Accessibility checklist with contrast and keyboard criteria

