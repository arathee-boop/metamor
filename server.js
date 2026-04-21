const path = require("path");
const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");
const Anthropic = require("@anthropic-ai/sdk");

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 6,
  },
});

const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest";
const MAX_TOKENS = Number(process.env.CLAUDE_MAX_TOKENS || 1200);
const MAX_MEMORY_MESSAGES = Number(process.env.CASE_MEMORY_MESSAGES || 30);
const MAX_MEMORY_PROJECTS = Number(process.env.CASE_MEMORY_PROJECTS || 50);
const MAX_CONTEXT_MESSAGES = Number(process.env.CASE_CONTEXT_MESSAGES || 16);

const projectMemory = new Map();
const understandChangeMemory = new Map();

app.use(express.static(path.resolve(__dirname)));
app.use(express.json({ limit: "1mb" }));

function requireApiKey(req, res, next) {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({
      error:
        "ANTHROPIC_API_KEY is not configured. Add it to your environment before using chat.",
    });
    return;
  }
  next();
}

function normalizeProjectId(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "default-project";
  return raw
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 64);
}

function sanitizeMessageText(value) {
  return String(value || "").trim().slice(0, 12000);
}

function sanitizeHistory(historyInput) {
  if (!Array.isArray(historyInput)) return [];
  return historyInput
    .map((entry) => ({
      role: entry?.role === "assistant" ? "assistant" : "user",
      content: sanitizeMessageText(entry?.content),
    }))
    .filter((entry) => entry.content);
}

function parseIncomingHistory(rawHistory) {
  if (!rawHistory) return [];
  try {
    return sanitizeHistory(JSON.parse(rawHistory));
  } catch {
    return [];
  }
}

function trimMemoryStore(store) {
  if (store.size <= MAX_MEMORY_PROJECTS) return;
  const oldestProject = [...store.entries()].sort(
    (a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0)
  )[0];
  if (oldestProject) {
    store.delete(oldestProject[0]);
  }
}

function getProjectState(store, projectId) {
  const normalized = normalizeProjectId(projectId);
  if (!store.has(normalized)) {
    store.set(normalized, { messages: [], updatedAt: Date.now() });
    trimMemoryStore(store);
  }
  return store.get(normalized);
}

function getProjectMessages(store, projectId) {
  return [...getProjectState(store, projectId).messages];
}

function setProjectMessages(store, projectId, messages) {
  const state = getProjectState(store, projectId);
  state.messages = sanitizeHistory(messages).slice(-MAX_MEMORY_MESSAGES);
  state.updatedAt = Date.now();
}

function appendProjectMessage(store, projectId, role, content) {
  const state = getProjectState(store, projectId);
  state.messages.push({
    role: role === "assistant" ? "assistant" : "user",
    content: sanitizeMessageText(content),
  });
  state.messages = state.messages.filter((entry) => entry.content).slice(-MAX_MEMORY_MESSAGES);
  state.updatedAt = Date.now();
}

function toAnthropicMessages(messages) {
  return sanitizeHistory(messages)
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));
}

function toTextDocument(file) {
  const safeName = file.originalname || "Attachment";
  const text = file.buffer.toString("utf8");
  return {
    type: "document",
    title: safeName,
    source: {
      type: "text",
      media_type: "text/plain",
      data: text,
    },
  };
}

function attachmentsSummary(files) {
  if (!files || files.length === 0) return "";
  const lines = files.map((file, idx) => {
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    return `${idx + 1}. ${file.originalname} (${sizeKb} KB, ${file.mimetype})`;
  });
  return `\n\nAttached files:\n${lines.join("\n")}`;
}

function buildSystemPrompt() {
  return `
You are Metamor Case-for-Change Assistant.
You combine 3 personas:
1) Change management scholar (framework rigor, stakeholder impact, readiness thinking)
2) Strategic communications advisor (clarity, influence, executive tone)
3) PR and narrative strategist (compelling messaging, audience tailoring, persuasion)

Output style rules:
- Be precise, practical, and evidence-oriented.
- Avoid generic fluff. Use concrete language and action framing.
- When useful, provide structure as:
  - Context
  - Problem
  - Why now
  - Risks of inaction
  - Proposed change
  - Expected benefits
  - Stakeholder impact
  - Suggested communications narrative
- If user gives incomplete context, ask 3-5 sharp clarifying questions before drafting.
- If files are attached, synthesize key points from them and explicitly reference what was used.
- Keep tone executive-ready but human.
`;
}

function buildUnderstandChangeSystemPrompt() {
  return `
You are Morp Understand-the-Change Assistant.
You are an expert in:
1) operations design and process excellence
2) management consulting problem-structuring
3) stakeholder and organizational impact analysis

Your mission:
- Help the user understand what changed between current and future processes.
- Ask sharp, targeted questions when information is missing.
- Use uploaded documents and user inputs to infer concrete differences.

Required behavior:
- If context is incomplete, ask 4-7 high-value questions before finalizing.
- If context is sufficient (or user asks to proceed), produce a structured report in markdown.
- Be specific and evidence-oriented; avoid generic wording.
- Distinguish clear facts vs assumptions.

Always structure report output as:

# Change Understanding Report
## 1) Process Changes Identified
- Capture all observed changes such as:
  - process steps added/removed/reordered
  - role/doer ownership changes
  - approval and control changes
  - handoff or SLA changes
  - new/removed technology or tooling
  - decision points, exceptions, or governance changes
- Include a concise table whenever possible.

## 2) Affected Stakeholders
- List impacted stakeholders (teams, roles, managers, support functions).
- Explain what changes for each and risk level (low/medium/high).

## 3) Improvements and Benefits
- Summarize operational improvements.
- Map each improvement to expected benefits (speed, quality, cost, risk, experience, compliance).
- Include measurable KPI suggestions where possible.
`;
}

function buildContentBlocks(userMessage, files) {
  const contentBlocks = [{ type: "text", text: userMessage + attachmentsSummary(files) }];
  for (const file of files) {
    if (file.mimetype.startsWith("text/") || file.mimetype === "application/json") {
      contentBlocks.push(toTextDocument(file));
    }
  }
  return contentBlocks;
}

function buildMemoSystemPrompt() {
  return `
You are Metamor Executive Memo Generator.
You combine:
1) change-management rigor
2) strategic communications clarity
3) executive-level narrative craft

Your task:
- Produce leadership-ready artifacts that are concise, specific, and action-oriented.
- Avoid generic language and filler.
- Surface assumptions and risks explicitly.
- Keep recommendations practical and decision-friendly.
`;
}

function extractTextResponse(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function buildTranscript(messages) {
  if (!messages.length) return "No conversation history was provided.";
  return messages
    .map((entry, idx) => `${idx + 1}. ${entry.role.toUpperCase()}: ${entry.content}`)
    .join("\n");
}

function parseMemoSections(rawText) {
  const text = String(rawText || "").trim();
  const sectionMatch = text.match(/===MEMO===\s*([\s\S]*?)\s*===SLIDES===\s*([\s\S]*)/i);
  if (sectionMatch) {
    return {
      memo: sectionMatch[1].trim(),
      slides: sectionMatch[2].trim(),
    };
  }

  return {
    memo: text,
    slides: [
      "# Slide-ready Outline",
      "",
      "## Slide 1 - Why Change Now",
      "- Insert top 3 reasons for urgency.",
      "",
      "## Slide 2 - Proposed Change",
      "- Summarize target-state process and scope.",
      "",
      "## Slide 3 - Impact and Mitigation",
      "- Stakeholder impacts",
      "- Top risks and mitigation plan",
      "",
      "## Slide 4 - Ask and Next Steps",
      "- Decision requested",
      "- Timeline and owners",
    ].join("\n"),
  };
}

app.get("/api/case-assistant/history/:projectId", (req, res) => {
  const projectId = normalizeProjectId(req.params.projectId);
  res.json({
    projectId,
    messages: getProjectMessages(projectMemory, projectId),
  });
});

app.delete("/api/case-assistant/history/:projectId", (req, res) => {
  const projectId = normalizeProjectId(req.params.projectId);
  projectMemory.delete(projectId);
  res.json({
    projectId,
    cleared: true,
  });
});

app.post("/api/case-assistant", requireApiKey, upload.array("files", 6), async (req, res) => {
  try {
    const userMessage = sanitizeMessageText(req.body.message);
    const projectId = normalizeProjectId(req.body.projectId);
    if (!userMessage) {
      res.status(400).json({ error: "Message is required." });
      return;
    }

    const existingMessages = getProjectMessages(projectMemory, projectId);
    if (existingMessages.length === 0) {
      const seedHistory = parseIncomingHistory(req.body.history);
      if (seedHistory.length > 0) {
        setProjectMessages(projectMemory, projectId, seedHistory);
      }
    }

    const files = req.files || [];
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const contentBlocks = buildContentBlocks(userMessage, files);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(),
      messages: [
        ...toAnthropicMessages(getProjectMessages(projectMemory, projectId)),
        { role: "user", content: contentBlocks },
      ],
    });

    const answer = extractTextResponse(response);
    const attachmentNames = files.map((file) => file.originalname).filter(Boolean);
    const memoryUserMessage = attachmentNames.length
      ? `${userMessage}\n\n[Attachments: ${attachmentNames.join(", ")}]`
      : userMessage;

    appendProjectMessage(projectMemory, projectId, "user", memoryUserMessage);
    appendProjectMessage(projectMemory, projectId, "assistant", answer);

    res.json({
      reply: answer || "I could not generate a response. Please try again.",
      projectId,
      memoryCount: getProjectMessages(projectMemory, projectId).length,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate response from Claude.",
      details: error?.message || String(error),
    });
  }
});

app.post("/api/case-assistant/memo", requireApiKey, async (req, res) => {
  try {
    const projectId = normalizeProjectId(req.body?.projectId);
    const objective = sanitizeMessageText(req.body?.objective);
    const conversation = getProjectMessages(projectMemory, projectId);

    if (conversation.length === 0) {
      res.status(400).json({
        error: "No conversation found for this project. Send at least one message first.",
      });
      return;
    }

    const prompt = [
      "Create two outputs from the transcript below for executive stakeholders.",
      "Output 1: one-page executive memo in markdown.",
      "Output 2: slide-ready outline in markdown (headings + concise bullets).",
      "",
      "Formatting rules:",
      "- Keep memo concise, practical, and executive-ready.",
      "- Include assumptions and key risks explicitly.",
      "- Use specific recommendations and next steps.",
      "- Keep slide bullets short and presentation-ready.",
      "",
      "Return EXACTLY in this structure:",
      "===MEMO===",
      "<memo markdown>",
      "===SLIDES===",
      "<slide-ready markdown>",
      "",
      `Project: ${projectId}`,
      objective ? `Objective override: ${objective}` : "",
      "",
      "Transcript:",
      buildTranscript(conversation.slice(-MAX_MEMORY_MESSAGES)),
    ]
      .filter(Boolean)
      .join("\n");

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Math.max(MAX_TOKENS, 1600),
      system: buildMemoSystemPrompt(),
      messages: [{ role: "user", content: prompt }],
    });

    const outputText = extractTextResponse(response);
    const sections = parseMemoSections(outputText);

    res.json({
      projectId,
      memo: sections.memo,
      slides: sections.slides,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate executive memo output.",
      details: error?.message || String(error),
    });
  }
});

app.get("/api/understand-change/history/:projectId", (req, res) => {
  const projectId = normalizeProjectId(req.params.projectId);
  res.json({
    projectId,
    messages: getProjectMessages(understandChangeMemory, projectId),
  });
});

app.delete("/api/understand-change/history/:projectId", (req, res) => {
  const projectId = normalizeProjectId(req.params.projectId);
  understandChangeMemory.delete(projectId);
  res.json({
    projectId,
    cleared: true,
  });
});

app.post("/api/understand-change", requireApiKey, upload.array("files", 6), async (req, res) => {
  try {
    const userMessage = sanitizeMessageText(req.body.message);
    const projectId = normalizeProjectId(req.body.projectId);
    if (!userMessage) {
      res.status(400).json({ error: "Message is required." });
      return;
    }

    const existingMessages = getProjectMessages(understandChangeMemory, projectId);
    if (existingMessages.length === 0) {
      const seedHistory = parseIncomingHistory(req.body.history);
      if (seedHistory.length > 0) {
        setProjectMessages(understandChangeMemory, projectId, seedHistory);
      }
    }

    const files = req.files || [];
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const contentBlocks = buildContentBlocks(userMessage, files);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Math.max(MAX_TOKENS, 1500),
      system: buildUnderstandChangeSystemPrompt(),
      messages: [
        ...toAnthropicMessages(getProjectMessages(understandChangeMemory, projectId)),
        { role: "user", content: contentBlocks },
      ],
    });

    const answer = extractTextResponse(response);
    const attachmentNames = files.map((file) => file.originalname).filter(Boolean);
    const memoryUserMessage = attachmentNames.length
      ? `${userMessage}\n\n[Attachments: ${attachmentNames.join(", ")}]`
      : userMessage;

    appendProjectMessage(understandChangeMemory, projectId, "user", memoryUserMessage);
    appendProjectMessage(understandChangeMemory, projectId, "assistant", answer);

    res.json({
      reply: answer || "I could not generate a response. Please try again.",
      projectId,
      memoryCount: getProjectMessages(understandChangeMemory, projectId).length,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate response from Understand-the-Change assistant.",
      details: error?.message || String(error),
    });
  }
});

app.post("/api/understand-change/report", requireApiKey, async (req, res) => {
  try {
    const projectId = normalizeProjectId(req.body?.projectId);
    const objective = sanitizeMessageText(req.body?.objective);
    const conversation = getProjectMessages(understandChangeMemory, projectId);

    if (conversation.length === 0) {
      res.status(400).json({
        error: "No conversation found for this project. Send at least one message first.",
      });
      return;
    }

    const prompt = [
      "Using the transcript below, produce the final report exactly in the required structure.",
      "Do not add extra top-level sections outside the required format.",
      "Use clear, practical, consulting-quality language.",
      "",
      objective ? `Objective override: ${objective}` : "",
      `Project: ${projectId}`,
      "",
      "Transcript:",
      buildTranscript(conversation.slice(-MAX_MEMORY_MESSAGES)),
    ]
      .filter(Boolean)
      .join("\n");

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Math.max(MAX_TOKENS, 1800),
      system: buildUnderstandChangeSystemPrompt(),
      messages: [{ role: "user", content: prompt }],
    });

    const report = extractTextResponse(response);
    res.json({
      projectId,
      report: report || "I could not generate a report. Please try again.",
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate understand-the-change report.",
      details: error?.message || String(error),
    });
  }
});

app.post("/api/assess-radius/parse", requireApiKey, upload.array("files", 6), async (req, res) => {
  try {
    const files = req.files || [];
    const projectName = sanitizeMessageText(req.body?.projectName);

    const fileContents = files
      .filter(f => f.mimetype.startsWith("text/") || f.mimetype === "application/json")
      .map(f => `=== ${f.originalname} ===\n${f.buffer.toString("utf8").slice(0, 3000)}`)
      .join("\n\n");

    const prompt = fileContents
      ? `Parse the following document(s) and extract a structured employee/stakeholder list.

${fileContents}

Return ONLY a valid JSON object with this exact structure:
{
  "columns": ["exact column names from the data"],
  "rows": [{ "column1": "value", ... }, ...]
}

Rules:
- Extract all person/employee attribute columns present in the source
- Always include these if present: Name, Title/Role, Department, Function, Team, Seniority/Level, Manager/Line Manager, Function Head, Region/Location
- Return up to 50 rows
- Use exact column names from the source
- If no clear employee data: generate 20 representative employees for a "${projectName || 'change initiative'}" project`
      : `Generate a realistic sample employee database of 20 people for a "${projectName || 'process change'}" initiative.
Return ONLY a valid JSON object:
{
  "columns": ["Name","Title","Function","Department","Team","Seniority","Line Manager","Function Head","Region"],
  "rows": [{ ... }, ...]
}`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response  = await anthropic.messages.create({
      model: MODEL, max_tokens: 2400,
      system: "You are a data extraction expert. Output only valid JSON when asked.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = extractTextResponse(response);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No valid JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ columns: parsed.columns || [], rows: parsed.rows || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to parse employee data.", details: error?.message || String(error) });
  }
});

app.post("/api/assess-radius/analyze", requireApiKey, upload.array("files", 6), async (req, res) => {
  try {
    const projectName    = sanitizeMessageText(req.body?.projectName);
    const changeAnalysis = sanitizeMessageText(req.body?.changeAnalysis);
    const files          = req.files || [];

    const fileContents = files
      .filter(f => f.mimetype.startsWith("text/") || f.mimetype === "application/json")
      .map(f => `File: ${f.originalname}\n${f.buffer.toString("utf8").slice(0, 2000)}`)
      .join("\n\n");

    const context = [
      projectName    ? `Project: ${projectName}` : "",
      changeAnalysis ? `Change Analysis:\n${changeAnalysis.slice(0, 1500)}` : "",
      fileContents   ? `Uploaded Documents:\n${fileContents}` : "",
    ].filter(Boolean).join("\n\n");

    const prompt = `You are a change management expert performing a stakeholder radius analysis.

${context || "No specific context provided. Generate representative values for a typical enterprise process change."}

Identify all relevant stakeholder attribute groups for this change. Return ONLY a valid JSON object:
{
  "geography":  ["array of geographic regions or office locations (3-6 values)"],
  "function":   ["array of business functions e.g. Finance, HR, Operations, IT (3-7 values)"],
  "department": ["array of specific departments or teams (4-8 values)"],
  "level":      ["array of job levels e.g. Executive, Senior Manager, Manager, Individual Contributor (3-5 values)"]
}

Base values on the provided context where possible; otherwise use realistic enterprise defaults. Return ONLY the JSON object.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response  = await anthropic.messages.create({
      model: MODEL, max_tokens: 800,
      system: "You are a change management expert. Output only valid JSON when asked.",
      messages: [{ role: "user", content: prompt }],
    });

    const text      = extractTextResponse(response);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No valid JSON in response");
    const attributes = JSON.parse(jsonMatch[0]);
    res.json({ attributes });
  } catch (error) {
    res.status(500).json({ error: "Failed to analyse stakeholder attributes.", details: error?.message || String(error) });
  }
});

app.post("/api/project-plan/generate", requireApiKey, async (req, res) => {
  try {
    const { projectName, template, changeAnalysis, executiveMemo } = req.body;
    const today = new Date().toISOString().split("T")[0];

    const contextParts = [];
    if (changeAnalysis) contextParts.push(`Change Analysis Report:\n${String(changeAnalysis).slice(0, 1800)}`);
    if (executiveMemo)  contextParts.push(`Executive Memo:\n${String(executiveMemo).slice(0, 900)}`);
    const context = contextParts.length
      ? `\n\nAvailable project context:\n${contextParts.join("\n\n")}`
      : "";

    const prompt = `Generate a project plan for a ${template || "Process Change"} initiative called "${sanitizeMessageText(projectName) || "Change Initiative"}".
Today's date is ${today}.${context}

Return a JSON array of tasks. Each task must use exactly this schema:
{
  "id": "unique-id",
  "group": "prep" | "step-01" | "step-02" | "step-03" | "step-04" | "step-05" | "step-06" | "adhoc",
  "title": "concise action-oriented task title",
  "owner": "role name (e.g. Project Lead, Change Manager, HR Lead, Sponsor)",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "status": "not-started",
  "dependencies": [],
  "comments": ""
}

Group meanings (Process Change template):
- prep:    General Preparation — 3 tasks, first 5 days
- step-01: Understand the Change — 4 tasks, days 6-14
- step-02: Make Case for Change — 4 tasks, days 15-24
- step-03: Assess Change Radius — 3 tasks, days 25-32
- step-04: Assess Change Readiness — 3 tasks, days 33-42
- step-05: Communication and Alignment — 4 tasks, days 43-56
- step-06: Enable Workforce — 4 tasks, days 57-72

Rules:
- Use specific, action-oriented titles tailored to the project context when available
- Dates must be sequential within each group and realistic across groups
- Owner must be a role, not a person name
- Return ONLY the raw JSON array — no markdown fences, no explanation, no preamble`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2400,
      system: "You are a change management project planner. Output only valid JSON arrays when asked.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = extractTextResponse(response);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No valid JSON array found in response");
    const tasks = JSON.parse(jsonMatch[0]);
    res.json({ tasks });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate project plan.",
      details: error?.message || String(error),
    });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Metamor server running at http://localhost:${PORT}`);
});
