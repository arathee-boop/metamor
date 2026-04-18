const fs = require("fs");
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

app.post(
  "/api/case-assistant",
  requireApiKey,
  upload.array("files", 6),
  async (req, res) => {
    try {
      const userMessage = (req.body.message || "").trim();
      if (!userMessage) {
        res.status(400).json({ error: "Message is required." });
        return;
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
        messages: [
          {
            role: "user",
            content: contentBlocks,
          },
        ],
      });

      const answer = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      res.json({
        reply: answer || "I could not generate a response. Please try again.",
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to generate response from Claude.",
        details: error?.message || String(error),
      });
    }
  }
);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Metamor server running at http://localhost:${PORT}`);
});
