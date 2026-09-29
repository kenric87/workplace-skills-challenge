const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ORIGINS = [
  "https://kenric87.github.io",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const DIMENSIONS = ["compliance", "judgment", "tone"];
const SCENARIO_FILES = [
  "gitlab-roadmap-sharing-scenario.json",
  "team-feedback-scenario.json",
  "media-inquiry-scenario.json",
];
const rateLimit = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 5;

class RequestValidationError extends Error {}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function allowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...configured]);
}

function loadJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), fileName), "utf8"));
}

function collectAnswers(answers, scenarios, rulebook) {
  if (!Array.isArray(answers) || answers.length < 3 || answers.length > 9) {
    throw new RequestValidationError("Complete all three scenarios before requesting AI feedback.");
  }

  const rulesById = new Map(rulebook.rules.map((rule) => [rule.id, rule]));
  const summaries = [];
  const totals = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0]));
  const referencedRuleIds = new Set();
  let answerIndex = 0;

  for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex += 1) {
    const scenario = scenarios[scenarioIndex];
    const nodes = new Map(scenario.nodes.map((node) => [node.id, node]));
    let nodeId = scenario.start;
    let answeredThisScenario = false;

    while (nodeId) {
      const answer = answers[answerIndex];
      if (!answer || answer.scenarioId !== scenario.scenario_id || answer.nodeId !== nodeId) {
        throw new RequestValidationError("Answer history does not match the scenario sequence.");
      }
      const node = nodes.get(nodeId);
      const choice = node?.choices.find((item) => item.id === answer.choiceId);
      if (!node || !choice) {
        throw new RequestValidationError("Answer history contains an unknown choice.");
      }

      for (const dimension of DIMENSIONS) {
        totals[dimension] += choice.effects[dimension] || 0;
      }
      for (const id of choice.rule_refs) referencedRuleIds.add(id);
      summaries.push({
        scenario: scenario.title,
        situation: node.narration,
        selectedResponse: choice.text,
        outcome: choice.consequence,
        ruleIds: choice.rule_refs,
      });

      answerIndex += 1;
      answeredThisScenario = true;
      nodeId = choice.next || null;
    }

    if (!answeredThisScenario) {
      throw new RequestValidationError("Answer history must include all three scenarios.");
    }
  }

  if (answerIndex !== answers.length) {
    throw new RequestValidationError("Answer history contains unexpected extra choices.");
  }

  const scores = Object.fromEntries(
    DIMENSIONS.map((dimension) => {
      const average = totals[dimension] / answers.length;
      return [dimension, Math.round(((average + 2) / 4) * 100)];
    }),
  );
  const focusDimension = [...DIMENSIONS].sort(
    (left, right) => scores[left] - scores[right],
  )[0];
  const usedRules = [...referencedRuleIds]
    .map((id) => rulesById.get(id))
    .filter(Boolean);
  const focusRules = usedRules.filter((rule) => rule.dimensions.includes(focusDimension));

  return {
    summaries,
    scores,
    focusDimension,
    rules: focusRules.length ? focusRules : usedRules,
  };
}

function responseSchema() {
  const stringField = { type: "STRING" };
  return {
    type: "OBJECT",
    properties: {
      feedback: stringField,
      focusDimension: { type: "STRING", enum: DIMENSIONS },
      followUp: {
        type: "OBJECT",
        properties: {
          title: stringField,
          situation: stringField,
          question: stringField,
          ruleRefs: { type: "ARRAY", items: stringField },
          choices: {
            type: "ARRAY",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING", enum: ["A", "B", "C"] },
                text: stringField,
                aligned: { type: "BOOLEAN" },
                feedback: stringField,
                ruleRefs: { type: "ARRAY", items: stringField },
              },
              required: ["id", "text", "aligned", "feedback", "ruleRefs"],
            },
          },
        },
        required: ["title", "situation", "question", "ruleRefs", "choices"],
      },
    },
    required: ["feedback", "focusDimension", "followUp"],
  };
}

function validateModelOutput(result, allowedRuleIds, focusDimension) {
  if (
    !result
    || typeof result.feedback !== "string"
    || result.feedback.length > 1200
    || result.focusDimension !== focusDimension
    || !result.followUp
    || typeof result.followUp.title !== "string"
    || typeof result.followUp.situation !== "string"
    || typeof result.followUp.question !== "string"
    || !Array.isArray(result.followUp.ruleRefs)
    || result.followUp.ruleRefs.length === 0
    || !Array.isArray(result.followUp.choices)
    || result.followUp.choices.length !== 3
  ) {
    throw new Error("The AI response did not match the required feedback format.");
  }

  const refs = [
    ...result.followUp.ruleRefs,
    ...result.followUp.choices.flatMap((choice) => (
      Array.isArray(choice.ruleRefs) ? choice.ruleRefs : []
    )),
  ];
  if (refs.length === 0 || refs.some((id) => !allowedRuleIds.has(id))) {
    throw new Error("The AI response cited a rule that was not provided.");
  }
  if (new Set(result.followUp.choices.map((choice) => choice.id)).size !== 3) {
    throw new Error("The AI response did not provide three distinct answer choices.");
  }
  if (
    !["A", "B", "C"].every((id) => result.followUp.choices.some((choice) => choice.id === id))
    || result.followUp.choices.some((choice) => typeof choice.aligned !== "boolean")
    || result.followUp.choices.some((choice) => (
      !Array.isArray(choice.ruleRefs) || choice.ruleRefs.length === 0
    ))
  ) {
    throw new Error("The AI response did not provide complete, valid answer choices.");
  }
  if (result.followUp.choices.filter((choice) => choice.aligned === true).length !== 1) {
    throw new Error("The AI response must identify exactly one rule-aligned choice.");
  }
  for (const value of [
    result.feedback,
    result.followUp.title,
    result.followUp.situation,
    result.followUp.question,
    ...result.followUp.choices.flatMap((choice) => [choice.text, choice.feedback]),
  ]) {
    if (typeof value !== "string" || value.length === 0 || value.length > 900) {
      throw new Error("The AI response contains missing or overly long text.");
    }
  }

  return result;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  const origins = allowedOrigins();
  if (origin && !origins.has(origin)) {
    return sendJson(res, 403, { error: "This website is not allowed to use the AI feedback service." });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Use POST to request AI feedback." });
  }
  const now = Date.now();
  for (const [ip, entry] of rateLimit) {
    if (now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) rateLimit.delete(ip);
  }
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const entry = rateLimit.get(ip);
  if (entry && entry.count >= RATE_LIMIT_REQUESTS) {
    return sendJson(res, 429, { error: "Too many AI feedback requests. Please wait a minute and try again." });
  }
  rateLimit.set(ip, entry
    ? { ...entry, count: entry.count + 1 }
    : { startedAt: now, count: 1 });
  if (!process.env.GEMINI_API_KEY) {
    return sendJson(res, 503, { error: "AI feedback is not configured on the server yet." });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return sendJson(res, 400, { error: "The answer history was not valid JSON." });
  }
  try {
    if (!body || JSON.stringify(body).length > 12000) {
      return sendJson(res, 413, { error: "The answer history is too large." });
    }

    const scenarios = SCENARIO_FILES.map(loadJson);
    const rulebook = loadJson("northwind-team-conduct-guide.json");
    const context = collectAnswers(body.answers, scenarios, rulebook);
    const allowedRuleIds = new Set(context.rules.map((rule) => rule.id));

    const prompt = [
      "You are a careful workplace learning coach. Give non-judgmental formative feedback based only on the supplied scenario choices and rule excerpts.",
      "Do not claim to measure a person's real ability, diagnose them, or introduce organizational rules not present in the excerpts.",
      "Explain one observed pattern, one useful next step, and why it follows the cited rules.",
      `The learner's lowest practice indicator in this small exercise is ${context.focusDimension} (${context.scores[context.focusDimension]}/100). Focus the follow-up scenario on this dimension, but describe it only as a practice opportunity.`,
      "Generate exactly one short multiple-choice follow-up with exactly three plausible choices and exactly one aligned choice.",
      "Every rule reference must be an ID from the provided excerpts. Keep the situation realistic, respectful, and answerable from those excerpts.",
      "Do not include personal data. The answer history consists only of scenario IDs, option IDs, and predefined choice text.",
      JSON.stringify({
        practiceIndicators: context.scores,
        focusDimension: context.focusDimension,
        selectedScenarios: context.summaries,
        ruleExcerpts: context.rules.map(({ id, title, quote, principle, dimensions }) => ({
          id,
          title,
          quote,
          principle,
          dimensions,
        })),
      }),
    ].join("\n\n");

    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-2.5-flash")}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1400,
            responseMimeType: "application/json",
            responseSchema: responseSchema(),
          },
        }),
      },
    );

    if (!apiResponse.ok) {
      console.error("Gemini request failed with status", apiResponse.status);
      return sendJson(res, 502, { error: "The AI service could not generate feedback. Please try again shortly." });
    }

    const apiData = await apiResponse.json();
    const outputText = apiData.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("");
    if (!outputText) {
      throw new Error("The AI service returned an empty response.");
    }
    const result = validateModelOutput(
      JSON.parse(outputText),
      allowedRuleIds,
      context.focusDimension,
    );

    return sendJson(res, 200, result);
  } catch (error) {
    console.error("AI feedback request failed:", error);
    const status = error instanceof RequestValidationError ? 400 : 502;
    return sendJson(res, status, {
      error: status === 400
        ? error.message
        : "Could not prepare valid AI feedback. Please try again.",
    });
  }
};
