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

function trimMemoryProjects() {
  if (projectMemory.size <= MAX_MEMORY_PROJECTS) return;
  const oldestProject = [...projectMemory.entries()].sort(
    (a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0)
  )[0];
  if (oldestProject) {
    projectMemory.delete(oldestProject[0]);
  }
}

function getProjectState(projectId) {
  const normalized = normalizeProjectId(projectId);
  if (!projectMemory.has(normalized)) {
    projectMemory.set(normalized, { messages: [], updatedAt: Date.now() });
    trimMemoryProjects();
  }
  return projectMemory.get(normalized);
}

function getProjectMessages(projectId) {
  return [...getProjectState(projectId).messages];
}

function setProjectMessages(projectId, messages) {
  const state = getProjectState(projectId);
  state.messages = sanitizeHistory(messages).slice(-MAX_MEMORY_MESSAGES);
  state.updatedAt = Date.now();
}

function appendProjectMessage(projectId, role, content) {
  const state = getProjectState(projectId);
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
    messages: getProjectMessages(projectId),
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

app.post(
  "/api/case-assistant",
  requireApiKey,
  upload.array("files", 6),
  async (req, res) => {
    try {
      const userMessage = sanitizeMessageText(req.body.message);
      const projectId = normalizeProjectId(req.body.projectId);
      if (!userMessage) {
        res.status(400).json({ error: "Message is required." });
        return;
      }

      const existingMessages = getProjectMessages(projectId);
      if (existingMessages.length === 0) {
        const seedHistory = parseIncomingHistory(req.body.history);
        if (seedHistory.length > 0) {
          setProjectMessages(projectId, seedHistory);
        }
      }

      const files = req.files || [];
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const contentBlocks = [{ type: "text", text: userMessage + attachmentsSummary(files) }];
      for (const file of files) {
        if (file.mimetype.startsWith("text/") || file.mimetype === "application/json") {
          contentBlocks.push(toTextDocument(file));
        }
      }

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        messages: [...toAnthropicMessages(getProjectMessages(projectId)), { role: "user", content: contentBlocks }],
      });

      const answer = extractTextResponse(response);
      const attachmentNames = files.map((file) => file.originalname).filter(Boolean);
      const memoryUserMessage = attachmentNames.length
        ? `${userMessage}\n\n[Attachments: ${attachmentNames.join(", ")}]`
        : userMessage;

      appendProjectMessage(projectId, "user", memoryUserMessage);
      appendProjectMessage(projectId, "assistant", answer);

      res.json({
        reply: answer || "I could not generate a response. Please try again.",
        projectId,
        memoryCount: getProjectMessages(projectId).length,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to generate response from Claude.",
        details: error?.message || String(error),
      });
    }
  }
);

app.post("/api/case-assistant/memo", requireApiKey, async (req, res) => {
  try {
    const projectId = normalizeProjectId(req.body?.projectId);
    const objective = sanitizeMessageText(req.body?.objective);
    const conversation = getProjectMessages(projectId);

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

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Metamor server running at http://localhost:${PORT}`);
});
