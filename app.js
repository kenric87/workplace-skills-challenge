const app = document.querySelector("#app");
const scenarioUrls = [
  "./gitlab-roadmap-sharing-scenario.json",
  "./team-feedback-scenario.json",
  "./media-inquiry-scenario.json",
  "./manager-deadline-scenario.json",
].map((url) => new URL(url, window.location.href));
const rulesUrl = new URL("./northwind-team-conduct-guide.json", window.location.href);

const labels = {
  start: "Start the challenge",
  choose: "What would you do?",
  customAnswer: "Or write your own response",
  customAnswerPlaceholder: "Type your response here…",
  customAnswerNotice: "Your answer is sent to Groq for brief feedback and scoring.",
  submitCustomAnswer: "Submit response",
  evaluatingCustomAnswer: "Getting AI feedback…",
  customAnswerError: "Could not evaluate your response. Please try again.",
  customAnswerScore: "AI practice score",
  customAnswerReason: "Why this score",
  step: "Question",
  outcome: "What happens next",
  aligned: "This choice aligns with the scenario rules",
  reconsider: "Consider another approach",
  next: "Continue",
  toResult: "Continue to results",
  playAgain: "Play again",
  rules: "Related rules",
  quote: "Source",
  principle: "In plain language",
  reflect: "Final reflection",
  reflectionGood: "Good reflection. You identified the key principle in this scenario.",
  reflectionTry: "Review the scenario feedback and choose the option that follows the relevant rule and process.",
  noReflection: "Choose the statement that best reflects what you learned.",
  currentScore: "Current score",
  finalScore: "Final score",
  compliance: "Compliance",
  judgment: "Judgment",
  tone: "Communication",
  loadError: "Could not load the scenario",
  loadErrorDetails: "Make sure the website files and all scenario and rulebook JSON files are in the same folder, and open the site through a web server.",
  source: "Source",
  format: "Challenge format",
  duration: "Estimated time",
  durationValue: "About 6–8 minutes · 10 decisions",
  notFound: "Scenario data not found",
  report: "Your practice profile",
  chartLabel: "Radar chart showing practice indicators for compliance, judgment, and communication",
  completed: "Decisions completed",
  nextScenario: "Preview next scenario",
  resultButton: "View your overall profile",
  startScenario: "Start scenario",
  withCharacter: "With",
  questionOf: "of",
  responseThinking: "is considering your response",
  responseReady: "A response from",
  yourResponse: "Your response",
  explanation: "Why this matters",
};

let scenarios = [];
let scenarioIndex = 0;
let scenario;
let ruleById;
let nodeById;
let endingById;
let state;
let totalQuestions = 0;

const dimensions = ["compliance", "judgment", "tone"];
const startingScore = 70;
const scoreChangePerAnswer = 3;
const severeChoicePenalty = 6;
const progressStorageKey = "workplace-lab-progress-v1";
const xpPerDecision = 10;
let scenarioRunIndexes = [];
let currentRunPosition = 0;
let learnerProgress;

function emptyLearnerProgress() {
  return {
    xp: 0,
    skills: Object.fromEntries(dimensions.map((dimension) => [
      dimension,
      { total: 0, count: 0 },
    ])),
    relationships: { manager: 50, teammate: 50 },
    scenarioNodes: {},
    completedScenarios: [],
  };
}

function loadLearnerProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(progressStorageKey) || "null");
    const defaults = emptyLearnerProgress();
    if (!saved || typeof saved !== "object") return defaults;

    return {
      ...defaults,
      ...saved,
      skills: Object.fromEntries(dimensions.map((dimension) => [
        dimension,
        {
          total: Number.isFinite(saved.skills?.[dimension]?.total)
            ? saved.skills[dimension].total
            : 0,
          count: Number.isFinite(saved.skills?.[dimension]?.count)
            ? saved.skills[dimension].count
            : 0,
        },
      ])),
      relationships: {
        manager: Number.isFinite(saved.relationships?.manager)
          ? Math.max(0, Math.min(100, saved.relationships.manager))
          : 50,
        teammate: Number.isFinite(saved.relationships?.teammate)
          ? Math.max(0, Math.min(100, saved.relationships.teammate))
          : 50,
      },
      scenarioNodes: saved.scenarioNodes && typeof saved.scenarioNodes === "object"
        ? saved.scenarioNodes
        : {},
      completedScenarios: Array.isArray(saved.completedScenarios)
        ? saved.completedScenarios
        : [],
    };
  } catch (error) {
    console.error("Could not load saved practice progress:", error);
    return emptyLearnerProgress();
  }
}

function saveLearnerProgress() {
  try {
    localStorage.setItem(progressStorageKey, JSON.stringify(learnerProgress));
  } catch (error) {
    console.error("Could not save practice progress on this device:", error);
  }
}

function scenarioAnsweredCount(scenarioItem) {
  return new Set(learnerProgress.scenarioNodes[scenarioItem.scenario_id] || []).size;
}

function progressSkillScore(dimension) {
  const skill = learnerProgress.skills[dimension];
  if (!skill.count) return 50;
  return Math.round(Math.max(0, Math.min(100, ((skill.total / skill.count + 2) / 4) * 100)));
}

function renderDashboardIcon(name) {
  const paths = {
    xp: '<path d="m12 2 2.2 6.1L20 10l-5.8 2L12 18l-2.2-6L4 10l5.8-1.9L12 2Z"/><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z"/>',
    compliance: '<path d="M12 3 19 6v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
    judgment: '<circle cx="12" cy="12" r="9"/><path d="M12 3v4m0 10v4M3 12h4m10 0h4"/><circle cx="12" cy="12" r="3"/>',
    communication: '<path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.8 8.8 0 0 1-3.7-.8L4 20l1.2-3.7A7 7 0 0 1 4 12c0-4.1 3.6-7.5 8-7.5s8 3.1 8 7Z"/><path d="M8 11h8m-8 3h5"/>',
    person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function renderScenarioArtwork(scenarioId) {
  const artwork = {
    S1: `
      <rect x="17" y="20" width="62" height="46" rx="7" fill="#fff" opacity=".95"/>
      <path d="M29 32h36M29 41h23M29 50h30" stroke="#54836a" stroke-width="3" stroke-linecap="round"/>
      <path d="m61 54 8 8 13-17" fill="none" stroke="#3f7b58" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="74" cy="27" r="8" fill="#f3d68f"/><path d="M74 23v5l3 2" fill="none" stroke="#986c25" stroke-width="2" stroke-linecap="round"/>
    `,
    S2: `
      <rect x="16" y="20" width="55" height="42" rx="9" fill="#fff" opacity=".96"/>
      <path d="M28 34h31M28 43h23" stroke="#6578a7" stroke-width="3" stroke-linecap="round"/>
      <path d="m30 62-7 9 1-12" fill="#fff"/>
      <rect x="49" y="43" width="37" height="27" rx="8" fill="#d8e9dc"/>
      <path d="M58 53h19M58 60h13" stroke="#3c7956" stroke-width="2.5" stroke-linecap="round"/>
    `,
    S3: `
      <rect x="25" y="28" width="52" height="39" rx="8" fill="#fff" opacity=".95"/>
      <path d="M34 39h34M34 48h21" stroke="#ad7551" stroke-width="3" stroke-linecap="round"/>
      <path d="M61 58v7m8-7v7m-12-1h16l-2-9h-12z" fill="#e7b66f" stroke="#986c47" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="69" cy="39" r="7" fill="#d9e8db"/><path d="M69 36v6m-3-3h6" stroke="#4c8260" stroke-width="2" stroke-linecap="round"/>
    `,
    S4: `
      <circle cx="50" cy="44" r="27" fill="#fff" opacity=".96"/>
      <circle cx="50" cy="44" r="20" fill="none" stroke="#6e86a9" stroke-width="3"/>
      <path d="M50 31v14l10 6" fill="none" stroke="#6e86a9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M24 67h52" stroke="#63816b" stroke-width="4" stroke-linecap="round"/>
      <path d="M34 67V58m11 9V54m11 13V60m11 7V51" stroke="#82aa8b" stroke-width="5" stroke-linecap="round"/>
    `,
  };
  return `
    <span class="mission-art mission-art-${scenarioId}" aria-hidden="true">
      <svg viewBox="0 0 100 88" focusable="false">${artwork[scenarioId] || artwork.S1}</svg>
    </span>
  `;
}

function renderProgressDashboard() {
  const skillCards = [
    { id: "compliance", title: "Compliance", icon: "compliance" },
    { id: "judgment", title: "Judgment", icon: "judgment" },
    { id: "tone", title: "Communication", icon: "communication" },
  ];

  return `
    <section class="progress-dashboard" aria-label="Progress">
      <div class="xp-card" aria-label="${learnerProgress.xp} experience points">
        <span class="dashboard-icon xp-icon">${renderDashboardIcon("xp")}</span>
        <strong>${learnerProgress.xp} <small>XP</small></strong>
      </div>
      <section class="skill-progress" aria-label="Skills">
        ${skillCards.map((skill) => {
    const score = progressSkillScore(skill.id);
    const started = learnerProgress.skills[skill.id].count > 0;
    return `
            <div class="skill-row">
              <div class="skill-row-label">
                <span class="dashboard-icon skill-icon skill-icon-${skill.id}">${renderDashboardIcon(skill.icon)}</span>
                <span>${skill.title}</span>
                <strong>${started ? `${score}%` : "—"}</strong>
              </div>
              <div class="dashboard-meter skill-meter" role="meter" aria-label="${skill.title}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${started ? score : 0}">
                <span style="width:${started ? score : 0}%"></span>
              </div>
            </div>
          `;
  }).join("")}
      </section>
      <section class="relationship-progress" aria-label="Relationships">
          <div class="rapport-row">
            <span class="dashboard-icon relation-icon manager-avatar">${renderDashboardIcon("person")}</span>
            <div class="rapport-content">
              <div class="skill-row-label"><span>Alex</span><strong>${learnerProgress.relationships.manager}%</strong></div>
              <div class="dashboard-meter rapport-meter" role="meter" aria-label="Practice rapport with Alex the manager" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${learnerProgress.relationships.manager}">
                <span style="width:${learnerProgress.relationships.manager}%"></span>
              </div>
            </div>
          </div>
          <div class="rapport-row">
            <span class="dashboard-icon relation-icon teammate-avatar">${renderDashboardIcon("person")}</span>
            <div class="rapport-content">
              <div class="skill-row-label"><span>Casey</span><strong>${learnerProgress.relationships.teammate}%</strong></div>
              <div class="dashboard-meter rapport-meter" role="meter" aria-label="Practice rapport with Casey the teammate" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${learnerProgress.relationships.teammate}">
                <span style="width:${learnerProgress.relationships.teammate}%"></span>
              </div>
            </div>
          </div>
      </section>
    </section>
  `;
}

function startChallenge(scenarioIndexes) {
  state = newGame();
  scenarioRunIndexes = scenarioIndexes;
  currentRunPosition = 0;
  scenarioIndex = scenarioRunIndexes[currentRunPosition];
  scenario = scenarios[scenarioIndex];
  nodeById = new Map(scenario.nodes.map((node) => [node.id, node]));
  endingById = new Map(scenario.endings.map((ending) => [ending.id, ending]));
  renderScenarioIntro();
}

function scoreBand(score) {
  if (score >= 70) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function renderRules(ruleIds) {
  const rules = ruleIds.map((id) => ruleById.get(id)).filter(Boolean);
  if (rules.length === 0) return "";

  return `
    <div class="rule-list">
      ${rules.map((rule) => `
        <article class="rule-card">
          <strong>${escapeText(rule.id)} · ${escapeText(rule.title)}</strong>
          <p class="rule-quote">${escapeText(labels.quote)}: “${escapeText(rule.quote)}”</p>
          <p class="rule-principle">${escapeText(labels.principle)}: ${escapeText(rule.principle)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderLanding() {
  app.innerHTML = `
    <section class="scenario-select" aria-labelledby="scenario-select-title">
      <div class="section-heading">
        <h1 id="scenario-select-title">Scenarios</h1>
        <button class="play-all-button" type="button" data-action="start">Play all <span aria-hidden="true">→</span></button>
      </div>
      <div class="scenario-preview" aria-label="Challenge scenarios">
        ${scenarios.map((item, index) => {
    const answered = scenarioAnsweredCount(item);
    const percent = Math.round((answered / item.nodes.length) * 100);
    const scenarioSkills = {
      S1: ["Confidentiality", "Judgment"],
      S2: ["Feedback", "Communication"],
      S3: ["Compliance", "Communication"],
      S4: ["Priorities", "Judgment"],
    }[item.scenario_id] || ["Communication", "Judgment"];
    return `
          <details class="scenario-accordion">
            <summary class="scenario-summary">
              ${renderScenarioArtwork(item.scenario_id)}
              <span class="mission-main">
                <span class="mission-title">${escapeText(item.title)}</span>
                <span class="mission-meta">${item.nodes.length} ${item.nodes.length === 1 ? "decision" : "decisions"} · ${answered === item.nodes.length ? "Complete" : `${percent}%`}</span>
              </span>
              <span class="mission-progress" aria-hidden="true"><span style="width:${percent}%"></span></span>
              <span class="mission-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div class="scenario-details">
              <p class="scenario-details-description">${escapeText(item.preview_description)}</p>
              <div class="mission-tags">
                ${scenarioSkills.map((skill) => `<span>${escapeText(skill)}</span>`).join("")}
              </div>
              <button class="mission-play-button" type="button" data-play-scenario="${index}">
                ${answered === item.nodes.length ? "Replay mission" : "Play this mission"} <span aria-hidden="true">→</span>
              </button>
            </div>
          </details>
        `;
  }).join("")}
      </div>
    </section>
    ${renderProgressDashboard()}
  `;

  app.querySelector('[data-action="start"]').addEventListener("click", () => {
    startChallenge(scenarios.map((_, index) => index));
  });
  app.querySelectorAll("[data-play-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      startChallenge([Number(button.dataset.playScenario)]);
    });
  });
  app.querySelectorAll(".scenario-accordion").forEach((accordion) => {
    accordion.addEventListener("toggle", () => {
      if (!accordion.open) return;
      app.querySelectorAll(".scenario-accordion").forEach((other) => {
        if (other !== accordion) other.open = false;
      });
    });
  });
}

function newGame() {
  return {
    score: startingScore,
    scores: { compliance: 0, judgment: 0, tone: 0 },
    choices: [],
    reflections: [],
  };
}

function progressFor(nodeId) {
  const index = scenario.nodes.findIndex((node) => node.id === nodeId);
  const previousQuestions = scenarioRunIndexes
    .slice(0, currentRunPosition)
    .map((scenarioRunIndex) => scenarios[scenarioRunIndex])
    .reduce((sum, item) => sum + item.nodes.length, 0);
  return {
    current: previousQuestions + index + 1,
    total: scenarioRunIndexes
      .map((scenarioRunIndex) => scenarios[scenarioRunIndex])
      .reduce((sum, item) => sum + item.nodes.length, 0),
  };
}

function sceneCharacter(node) {
  return scenario.characters.find((character) => character.id === node.speaker && character.id !== "C1")
    || scenario.characters.find((character) => character.id !== "C1")
    || scenario.characters.find((character) => character.id === node.speaker);
}

function renderScenarioIntro() {
  const firstNode = nodeById.get(scenario.start);
  if (!firstNode) {
    renderError(labels.notFound);
    return;
  }
  const character = sceneCharacter(firstNode);
  const partner = scenario.preview_partner_role || "your colleague";
  const duration = `~${scenario.nodes.length} min`;
  app.innerHTML = `
    <section class="scenario-intro-card">
      <div class="scenario-intro-art">
        <span class="intro-duration">${escapeText(duration)}</span>
        <span class="intro-orbit intro-orbit-left" aria-hidden="true"></span>
        <span class="intro-orbit intro-orbit-right" aria-hidden="true"></span>
        <div class="intro-character">
          ${renderCharacterAvatar(character)}
        </div>
      </div>
      <div class="scenario-intro-content">
        <p class="intro-character-label">${escapeText(`${labels.withCharacter} ${character?.name || "your colleague"}, ${partner}`)}</p>
        <h1>${escapeText(scenario.title)}</h1>
        <p class="intro-description">${escapeText(scenario.preview_description)}</p>
        <button class="primary-button intro-start-button" type="button" data-action="start-scenario">
          ${escapeText(labels.startScenario)} →
        </button>
      </div>
    </section>
  `;
  app.querySelector('[data-action="start-scenario"]').addEventListener("click", () => {
    renderNode(scenario.start);
  });
}

function renderCharacterAvatar(character, compact = false, running = false) {
  if (!character) return "";
  const theme = [
    { bg: "#dcebe2", hair: "#374b40", skin: "#c98d6c", shirt: "#317457" },
    { bg: "#e6e2f2", hair: "#473f51", skin: "#e0ac86", shirt: "#65518d" },
    { bg: "#f1e4d6", hair: "#55443a", skin: "#a96f53", shirt: "#ae6a39" },
    { bg: "#dce9f0", hair: "#394955", skin: "#d7a17d", shirt: "#3e718e" },
  ][[...character.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4];
  const label = `${character.name}, ${character.role}`;
  const avatar = running
    ? `
      <svg class="running-figure" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r="48" fill="var(--avatar-bg)"></circle>
        <g class="runner-body">
          <path d="M51 34 42 52l16 7 10-19-10-7z" fill="var(--avatar-shirt)"></path>
          <g class="runner-limb runner-leg-back">
            <path d="m48 55-12 15-13 4" fill="none" stroke="var(--avatar-shirt)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="m23 74-8 2" fill="none" stroke="var(--avatar-hair)" stroke-width="6" stroke-linecap="round"></path>
          </g>
          <g class="runner-limb runner-leg-front">
            <path d="m54 56 14 10-1 13" fill="none" stroke="var(--avatar-shirt)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="m67 79-8 3" fill="none" stroke="var(--avatar-hair)" stroke-width="6" stroke-linecap="round"></path>
          </g>
          <g class="runner-limb runner-arm-back">
            <path d="m47 39-13 10 7 9" fill="none" stroke="var(--avatar-shirt)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="m41 58 4 3" fill="none" stroke="var(--avatar-skin)" stroke-width="6" stroke-linecap="round"></path>
          </g>
          <g class="runner-limb runner-arm-front">
            <path d="m59 39 14-9 8 6" fill="none" stroke="var(--avatar-shirt)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="m81 36 4 4" fill="none" stroke="var(--avatar-skin)" stroke-width="6" stroke-linecap="round"></path>
          </g>
          <path d="M46 23c0-10 5-16 13-16 9 0 14 6 13 17l-2 10-18-2z" fill="var(--avatar-hair)"></path>
          <circle cx="57" cy="24" r="10" fill="var(--avatar-skin)"></circle>
          <path d="M47 23c0-10 5-16 13-16 9 0 14 6 13 17-6-2-10-6-12-11-3 5-8 9-14 10z" fill="var(--avatar-hair)"></path>
          <path d="m64 25 4 1" stroke="var(--avatar-hair)" stroke-width="2" stroke-linecap="round"></path>
        </g>
      </svg>
    `
    : `
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r="48" fill="var(--avatar-bg)"></circle>
        <path d="M11 96c2-20 15-31 37-31s35 11 37 31" fill="var(--avatar-shirt)"></path>
        <path d="M39 61h18v17H39z" fill="var(--avatar-skin)"></path>
        <path d="M26 40c0-20 9-30 23-30s23 10 23 30v13c0 15-10 24-23 24S26 68 26 53z" fill="var(--avatar-skin)"></path>
        <path d="M25 42c-2-22 8-34 24-34 17 0 25 13 22 33-4-2-7-7-8-12-8 5-19 7-37 6z" fill="var(--avatar-hair)"></path>
        <path d="M35 47h5m16 0h5" stroke="var(--avatar-hair)" stroke-width="3" stroke-linecap="round"></path>
        <path d="M42 62c4 3 8 3 12 0" fill="none" stroke="var(--avatar-hair)" stroke-width="2" stroke-linecap="round"></path>
      </svg>
    `;
  return `
    <span class="character-avatar${compact ? " is-compact" : ""}${running ? " is-running" : ""}" role="img" aria-label="${escapeText(label)}" style="--avatar-bg:${theme.bg};--avatar-hair:${theme.hair};--avatar-skin:${theme.skin};--avatar-shirt:${theme.shirt}">
      ${avatar}
    </span>
  `;
}

function renderNode(nodeId) {
  const node = nodeById.get(nodeId);
  if (!node) {
    renderError(labels.notFound);
    return;
  }

  const progress = progressFor(nodeId);
  const character = sceneCharacter(node);
  app.innerHTML = `
    <section class="game-card">
      <div class="score-meter">
        <div class="score-meter-heading">
          <span>${escapeText(labels.currentScore)}</span>
          <strong><span data-current-score>${state.score}</span><small> / 100</small></strong>
        </div>
        <div class="score-meter-track score-band-${scoreBand(state.score)}" role="meter" aria-label="${escapeText(labels.currentScore)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${state.score}">
          <div class="score-meter-fill" data-score-fill style="width:${state.score}%"></div>
        </div>
      </div>
      <div class="game-topline">
        <div>
          <span class="step-label">${escapeText(scenario.title)}</span>
          <span class="question-count">${escapeText(labels.step)} ${progress.current} ${escapeText(labels.questionOf)} ${progress.total}</span>
        </div>
      </div>
      <div class="conversation-turn">
        ${renderCharacterAvatar(character)}
        <div class="conversation-content">
          <span class="speaker">${escapeText(character ? `${character.name} · ${character.role}` : labels.outcome)}</span>
          <p class="scenario-copy">${escapeText(node.narration)}</p>
        </div>
      </div>
      <p class="choice-heading">${escapeText(labels.choose)}</p>
      <div class="choice-list">
        ${node.choices.map((choice, index) => `
          <button class="choice-button" type="button" data-choice="${escapeText(choice.id)}">
            <span class="choice-letter">${String.fromCharCode(65 + index)}</span>
            <span class="choice-text">${escapeText(choice.text)}</span>
          </button>
        `).join("")}
      </div>
      <form class="custom-answer-form" data-custom-answer-form>
        <label for="custom-answer">${escapeText(labels.customAnswer)}</label>
        <p class="custom-answer-note">${escapeText(labels.customAnswerNotice)}</p>
        <textarea id="custom-answer" name="custom-answer" rows="3" maxlength="1000" required placeholder="${escapeText(labels.customAnswerPlaceholder)}"></textarea>
        <button class="primary-button" type="submit">${escapeText(labels.submitCustomAnswer)} →</button>
      </form>
    </section>
  `;

  app.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const choice = node.choices.find((item) => item.id === button.dataset.choice);
      choose(node, choice);
    });
  });

  app.querySelector("[data-custom-answer-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    const answerField = app.querySelector("#custom-answer");
    const answer = answerField.value.trim();
    if (!answer) {
      answerField.focus();
      return;
    }
    submitCustomAnswer(node, answer);
  });
}

async function submitCustomAnswer(node, answer) {
  const form = app.querySelector("[data-custom-answer-form]");
  const submitButton = form?.querySelector('button[type="submit"]');
  if (!form || !submitButton || form.dataset.pending === "true") return;
  let status = form.querySelector(".custom-answer-status");
  if (!status) {
    status = document.createElement("p");
    status.className = "custom-answer-status";
    status.setAttribute("role", "status");
    form.append(status);
  }
  status.textContent = labels.evaluatingCustomAnswer;

  form.dataset.pending = "true";
  submitButton.disabled = true;
  submitButton.textContent = labels.evaluatingCustomAnswer;
  app.querySelectorAll("[data-choice]").forEach((button) => {
    button.disabled = true;
  });

  try {
    if (!window.WORKPLACE_AI_ENDPOINT) {
      throw new Error("The AI feedback service is not configured.");
    }
    const response = await fetch(window.WORKPLACE_AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: scenario.scenario_id,
        nodeId: node.id,
        answer,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(labels.customAnswerError);
    }
    if (!response.ok) {
      throw new Error(typeof result.error === "string" ? result.error : labels.customAnswerError);
    }
    if (
      !result
      || typeof result.reply !== "string"
      || typeof result.reason !== "string"
      || !Number.isInteger(result.score)
      || result.score < 1
      || result.score > 5
    ) {
      throw new Error(labels.customAnswerError);
    }

    const nextChoice = node.choices.find((choice) => choice.is_aligned);
    if (!nextChoice) {
      throw new Error("This question has no valid next step for a custom response.");
    }
    const dimensionEffect = result.score - 3;
    const customChoice = {
      ...nextChoice,
      reply: result.reply,
      consequence: result.reason,
      effects: Object.fromEntries(dimensions.map((dimension) => [dimension, dimensionEffect])),
    };
    renderChoiceFeedback(node, customChoice, answer, { customScore: result.score });
  } catch (error) {
    console.error("Could not evaluate the custom response:", error);
    form.dataset.pending = "false";
    submitButton.disabled = false;
    submitButton.textContent = `${labels.submitCustomAnswer} →`;
    app.querySelectorAll("[data-choice]").forEach((button) => {
      button.disabled = false;
    });
    status.textContent = error.message || labels.customAnswerError;
  }
}

function choose(node, choice, answerText = choice.text) {
  renderChoiceFeedback(node, choice, answerText);
}

function updateScoreMeter() {
  const scoreValue = app.querySelector("[data-current-score]");
  const scoreFill = app.querySelector("[data-score-fill]");
  const scoreMeter = app.querySelector(".score-meter-track");
  if (!scoreValue || !scoreFill || !scoreMeter) return;
  scoreValue.textContent = String(state.score);
  scoreFill.style.width = `${state.score}%`;
  scoreMeter.setAttribute("aria-valuenow", String(state.score));
  scoreMeter.className = `score-meter-track score-band-${scoreBand(state.score)}`;
}

async function renderChoiceFeedback(node, choice, answerText, { customScore } = {}) {
  const aligned = choice.is_aligned;
  const character = sceneCharacter(node);
  const target = choice.next
    ? () => renderNode(choice.next)
    : () => completeScenario(choice.ending_id);
  const nextStep = choice.next
    ? labels.next
    : currentRunPosition < scenarioRunIndexes.length - 1
      ? labels.nextScenario
      : labels.resultButton;

  const feedback = document.createElement("section");
  feedback.className = "response-panel";
  feedback.setAttribute("aria-live", "polite");
  feedback.innerHTML = `
    <div class="player-message">
      <span class="message-label">${escapeText(labels.yourResponse)}</span>
      <p>${escapeText(answerText)}</p>
    </div>
    <div class="thinking-message" role="status">
      ${renderCharacterAvatar(character, true, true)}
      <div class="thinking-copy">
        <strong>${escapeText(character?.name || labels.outcome)} ${escapeText(labels.responseThinking)}</strong>
        <span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
    </div>
  `;
  app.querySelector(".choice-list").replaceWith(feedback);
  app.querySelector("[data-custom-answer-form]")?.remove();
  app.querySelector(".choice-heading").remove();

  const thinkingDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1250;
  await new Promise((resolve) => window.setTimeout(resolve, thinkingDuration));
  if (!feedback.isConnected) return;
  feedback.className = `feedback-panel conversation-feedback${aligned ? "" : " is-misaligned"}`;
  feedback.innerHTML = `
    <div class="player-message">
      <span class="message-label">${escapeText(labels.yourResponse)}</span>
      <p>${escapeText(answerText)}</p>
    </div>
    <section class="character-response-card" aria-label="${escapeText(labels.responseReady)}">
      <div class="response-turn">
        ${renderCharacterAvatar(character, true)}
        <div class="response-dialogue">
          <span class="message-label">${escapeText(labels.responseReady)} ${escapeText(character?.name || labels.outcome)}</span>
          <p>${escapeText(choice.reply || choice.consequence)}</p>
        </div>
      </div>
    </section>
    <section class="coaching-feedback-card" aria-label="${escapeText(labels.explanation)}">
      <div class="feedback-summary">
        <h2 class="feedback-title">${escapeText(customScore === undefined
    ? (aligned ? labels.aligned : labels.reconsider)
    : `${labels.customAnswerScore}: +${customScore}`)}</h2>
        <div class="explanation-block">
          <h3 class="explanation-title">${escapeText(customScore === undefined
    ? labels.explanation
    : labels.customAnswerReason)}</h3>
          <p class="feedback-copy">${escapeText(choice.consequence)}</p>
        </div>
      </div>
      ${customScore === undefined ? renderRules(choice.rule_refs) : ""}
    </section>
    <button class="primary-button feedback-next-button${nextStep === labels.resultButton ? " feedback-result-button" : ""}" type="button">
      ${escapeText(nextStep)} <span aria-hidden="true">→</span>
    </button>
  `;
  await new Promise((resolve) => window.setTimeout(resolve, 500));
  if (!feedback.isConnected) return;

  const scoreDelta = customScore ?? (choice.is_aligned
    ? scoreChangePerAnswer
    : -(choice.score_penalty ?? scoreChangePerAnswer));
  state.score = Math.max(0, Math.min(100, state.score + scoreDelta));
  for (const dimension of Object.keys(state.scores)) {
    state.scores[dimension] += choice.effects[dimension] ?? 0;
  }
  state.choices.push({
    scenarioId: scenario.scenario_id,
    nodeId: node.id,
    choiceId: choice.id,
  });
  recordPracticeProgress(node, choice, customScore);
  updateScoreMeter();

  feedback.querySelector(".feedback-next-button").addEventListener("click", target);
}

function recordPracticeProgress(node, choice, customScore) {
  const scenarioId = scenario.scenario_id;
  const answeredNodes = new Set(learnerProgress.scenarioNodes[scenarioId] || []);
  if (answeredNodes.has(node.id)) return;

  answeredNodes.add(node.id);
  learnerProgress.scenarioNodes[scenarioId] = [...answeredNodes];
  learnerProgress.xp += xpPerDecision + (customScore === undefined
    ? (choice.is_aligned ? 5 : 0)
    : (customScore >= 4 ? 5 : 0));

  for (const dimension of dimensions) {
    learnerProgress.skills[dimension].total += choice.effects[dimension] ?? 0;
    learnerProgress.skills[dimension].count += 1;
  }

  const relationshipKey = scenarioId === "S4"
    ? "manager"
    : scenarioId === "S2"
      ? "teammate"
      : null;
  if (relationshipKey) {
    learnerProgress.relationships[relationshipKey] = Math.max(
      0,
      Math.min(100, learnerProgress.relationships[relationshipKey] + (choice.effects.tone ?? 0) * 5),
    );
  }

  if (answeredNodes.size === scenario.nodes.length
    && !learnerProgress.completedScenarios.includes(scenarioId)) {
    learnerProgress.completedScenarios.push(scenarioId);
  }
  saveLearnerProgress();
}

function completeScenario(endingId) {
  const ending = endingById.get(endingId);
  if (!ending) {
    renderError(labels.notFound);
    return;
  }

  if (currentRunPosition < scenarioRunIndexes.length - 1) {
    currentRunPosition += 1;
    scenarioIndex = scenarioRunIndexes[currentRunPosition];
    scenario = scenarios[scenarioIndex];
    nodeById = new Map(scenario.nodes.map((node) => [node.id, node]));
    endingById = new Map(scenario.endings.map((item) => [item.id, item]));
    renderScenarioIntro();
    return;
  }

  renderReport(ending);
}

function normalizedScore(dimension) {
  const maximum = state.choices.length * 2;
  if (maximum === 0) return 50;
  return Math.round(Math.max(0, Math.min(100, ((state.scores[dimension] + maximum) / (maximum * 2)) * 100)));
}

function radarPoints(values, radius, centerX = 220, centerY = 165) {
  const angles = [-90, 30, 150];
  return angles.map((angle, index) => {
    const radians = (angle * Math.PI) / 180;
    const value = values[index] / 100;
    return `${centerX + Math.cos(radians) * radius * value},${centerY + Math.sin(radians) * radius * value}`;
  }).join(" ");
}

function renderRadarChart(scores) {
  const values = dimensions.map((dimension) => scores[dimension]);
  const labelsAt = [
    { x: 220, y: 27, anchor: "middle", text: labels.compliance },
    { x: 335, y: 244, anchor: "start", text: labels.judgment },
    { x: 105, y: 244, anchor: "end", text: labels.tone },
  ];
  return `
    <svg class="radar-chart" viewBox="0 0 440 285" role="img" aria-label="${escapeText(labels.chartLabel)}">
      <title>${escapeText(labels.chartLabel)}</title>
      ${[20, 40, 60, 80, 100].map((value) => `
        <polygon class="radar-grid" points="${radarPoints([value, value, value], 100)}"></polygon>
      `).join("")}
      ${[0, 1, 2].map((index) => `
        <line class="radar-axis" x1="220" y1="165" x2="${[220, 306.6, 133.4][index]}" y2="${[65, 215, 215][index]}"></line>
      `).join("")}
      <polygon class="radar-area" points="${radarPoints(values, 100)}"></polygon>
      ${radarPoints(values, 100).split(" ").map((point) => {
        const [cx, cy] = point.split(",");
        return `<circle class="radar-point" cx="${cx}" cy="${cy}" r="4"></circle>`;
      }).join("")}
      ${labelsAt.map((item) => `
        <text class="radar-label" x="${item.x}" y="${item.y}" text-anchor="${item.anchor}">${escapeText(item.text)}</text>
      `).join("")}
    </svg>
  `;
}

function renderReport(ending) {
  const completedDecisionCount = state.choices.length;
  const scores = Object.fromEntries(dimensions.map((dimension) => [
    dimension,
    state.score === 100 ? 100 : normalizedScore(dimension),
  ]));
  app.innerHTML = `
    <section class="game-card report-card">
      <p class="eyebrow">${completedDecisionCount} ${escapeText(labels.completed)} · ${scenarioRunIndexes.length} scenarios</p>
      <h1>${escapeText(labels.report)}</h1>
      <section class="final-score-card" aria-label="${escapeText(labels.finalScore)}">
        <div class="final-score-heading">
          <span>${escapeText(labels.finalScore)}</span>
          <strong>${state.score}<small> / 100</small></strong>
        </div>
        <div class="score-meter-track score-band-${scoreBand(state.score)}" role="meter" aria-label="${escapeText(labels.finalScore)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${state.score}">
          <div class="score-meter-fill" style="width:${state.score}%"></div>
        </div>
      </section>
      <div class="radar-wrap">${renderRadarChart(scores)}</div>
      <section class="feedback-panel">
        <h2 class="feedback-title">Final reflection</h2>
        <p class="feedback-copy">${escapeText(ending.reflection.prompt)}</p>
        <div class="reflection-list">
          ${ending.reflection.options.map((option) => `
            <button class="reflection-button" type="button" data-reflection="${escapeText(option.id)}" aria-pressed="false">
              ${escapeText(option.text)}
            </button>
          `).join("")}
        </div>
        <p class="reflection-response" role="status">${escapeText(labels.noReflection)}</p>
      </section>
      <div class="result-actions">
        <button class="primary-button" type="button" data-action="restart">${escapeText(labels.playAgain)} ↻</button>
        <button class="secondary-button" type="button" data-action="home">Back to progress dashboard</button>
      </div>
    </section>
  `;

  app.querySelectorAll("[data-reflection]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = ending.reflection.options.find((option) => option.id === button.dataset.reflection);
      state.reflections.push({ optionId: selected.id });
      app.querySelectorAll("[data-reflection]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      app.querySelector(".reflection-response").textContent =
        selected.aligned ? labels.reflectionGood : labels.reflectionTry;
    });
  });

  app.querySelector('[data-action="restart"]').addEventListener("click", () => {
    startChallenge(scenarioRunIndexes);
  });

  app.querySelector('[data-action="home"]').addEventListener("click", () => {
    renderLanding();
  });
}

function renderError(message) {
  app.innerHTML = `
    <section class="error-card">
      <h1>${escapeText(labels.loadError)}</h1>
      <p>${escapeText(message)}</p>
      <p>${escapeText(labels.loadErrorDetails)}</p>
    </section>
  `;
}

function validateScenario(data, rules) {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.endings)) {
    throw new Error("Scenario data is missing nodes or endings.");
  }
  if (typeof data.preview_description !== "string" || !data.preview_description.trim()) {
    throw new Error(`Scenario ${data.scenario_id} is missing its preview description.`);
  }
  const ids = new Set(rules.rules.map((rule) => rule.id));
  const referencedIds = [
    ...data.rule_ids,
    ...data.nodes.flatMap((node) => node.choices.flatMap((choice) => choice.rule_refs)),
    ...data.endings.flatMap((ending) => ending.rule_refs),
  ];
  const missing = referencedIds.filter((id) => !ids.has(id));
  if (missing.length) {
    throw new Error(`Scenario references unknown rules: ${[...new Set(missing)].join(", ")}`);
  }
  const nodeIds = new Set(data.nodes.map((node) => node.id));
  const endingIds = new Set(data.endings.map((ending) => ending.id));
  for (const node of data.nodes) {
    for (const choice of node.choices) {
      const hasValidNext = choice.next && nodeIds.has(choice.next);
      const hasValidEnding = choice.ending_id && endingIds.has(choice.ending_id);
      if (Boolean(hasValidNext) === Boolean(hasValidEnding)) {
        throw new Error(`Choice ${choice.id} must point to exactly one valid next node or ending.`);
      }
      for (const dimension of dimensions) {
        if (!Number.isFinite(choice.effects[dimension]) || Math.abs(choice.effects[dimension]) > 2) {
          throw new Error(`Choice ${choice.id} has an invalid ${dimension} score.`);
        }
      }
      if (choice.score_penalty !== undefined && (choice.is_aligned || choice.score_penalty !== severeChoicePenalty)) {
        throw new Error(`Choice ${choice.id} has an invalid severe-choice penalty.`);
      }
    }
  }
}

async function initialize() {
  try {
    learnerProgress = loadLearnerProgress();
    const [scenarioResponses, rulesResponse] = await Promise.all([
      Promise.all(scenarioUrls.map((url) => fetch(url))),
      fetch(rulesUrl),
    ]);
    if (scenarioResponses.some((response) => !response.ok) || !rulesResponse.ok) {
      throw new Error("Could not fetch all scenarios or the rulebook.");
    }
    [scenarios, ruleById] = await Promise.all([
      Promise.all(scenarioResponses.map((response) => response.json())),
      rulesResponse.json(),
    ]);
    scenarios.forEach((item) => validateScenario(item, ruleById));
    totalQuestions = scenarios.reduce((sum, item) => sum + item.nodes.length, 0);
    ruleById = new Map(ruleById.rules.map((rule) => [rule.id, rule]));
    renderLanding();
  } catch (error) {
    console.error("Failed to initialize the scenario:", error);
    renderError(`${labels.loadErrorDetails} (${error.message})`);
  }
}

initialize();
