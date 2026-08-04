"use strict";

const state = {
  featured: null,
  match: null,
  timer: null,
};

const el = {
  refresh: document.querySelector("#refreshButton"),
  autoRefresh: document.querySelector("#autoRefresh"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  lastUpdated: document.querySelector("#lastUpdated"),
  featuredMatches: document.querySelector("#featuredMatches"),
  featuredCount: document.querySelector("#featuredCount"),
  summaryCards: document.querySelector("#summaryCards"),
  matchInfo: document.querySelector("#matchInfo"),
  conditions: document.querySelector("#conditions"),
  overs: document.querySelector("#overs"),
  commentary: document.querySelector("#commentary"),
  commentaryCount: document.querySelector("#commentaryCount"),
  rawSelector: document.querySelector("#rawSelector"),
  rawJson: document.querySelector("#rawJson"),
  copyButton: document.querySelector("#copyButton"),
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function display(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripHtml(value) {
  const holder = document.createElement("div");
  holder.innerHTML = String(value ?? "");
  return holder.textContent || holder.innerText || "";
}

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findValue(root, keys, maxDepth = 7) {
  const wanted = new Set(keys.map(normalizedKey));
  const visited = new WeakSet();

  function walk(value, depth) {
    if (depth > maxDepth || value === null || typeof value !== "object") {
      return undefined;
    }
    if (visited.has(value)) return undefined;
    visited.add(value);

    if (isObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (wanted.has(normalizedKey(key)) && child !== null && child !== "") {
          return child;
        }
      }
      for (const child of Object.values(value)) {
        const found = walk(child, depth + 1);
        if (found !== undefined) return found;
      }
    } else {
      for (const child of value) {
        const found = walk(child, depth + 1);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }

  return walk(root, 0);
}

function collectArrays(root, maxDepth = 7) {
  const results = [];
  const visited = new WeakSet();

  function walk(value, depth, path) {
    if (depth > maxDepth || value === null || typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      results.push({ path, value });
      value.forEach((child, index) =>
        walk(child, depth + 1, `${path}[${index}]`)
      );
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      walk(child, depth + 1, path ? `${path}.${key}` : key);
    }
  }

  walk(root, 0, "");
  return results;
}

function objectLooksLikeMatch(item) {
  if (!isObject(item)) return false;
  const keys = Object.keys(item).map(normalizedKey).join(" ");
  const markers = ["match", "team", "score", "status", "series", "venue"];
  return markers.filter((marker) => keys.includes(marker)).length >= 2;
}

function featuredMatchArray(data) {
  if (Array.isArray(data)) return data.filter(isObject);

  const direct = [
    data?.matches,
    data?.featured_matches,
    data?.featuredMatches,
    data?.data,
    data?.result,
    data?.results,
  ];

  for (const candidate of direct) {
    if (Array.isArray(candidate) && candidate.some(objectLooksLikeMatch)) {
      return candidate;
    }
  }

  return (
    collectArrays(data)
      .filter(({ value }) => value.some(objectLooksLikeMatch))
      .sort((a, b) => b.value.length - a.value.length)[0]?.value || []
  );
}

function objectName(value) {
  if (!isObject(value)) return display(value, "");
  return display(
    value.name ??
      value.team_name ??
      value.teamName ??
      value.short_name ??
      value.shortName ??
      value.title,
    ""
  );
}

function teamsFor(match) {
  const pairs = [
    [match?.home_team, match?.away_team],
    [match?.homeTeam, match?.awayTeam],
    [match?.team_a, match?.team_b],
    [match?.teamA, match?.teamB],
    [match?.team1, match?.team2],
    [match?.localteam, match?.visitorteam],
  ];

  for (const [first, second] of pairs) {
    const firstName = objectName(first);
    const secondName = objectName(second);
    if (firstName || secondName) return [firstName, secondName];
  }

  for (const candidate of [match?.teams, match?.participants, match?.competitors]) {
    if (Array.isArray(candidate) && candidate.length >= 2) {
      return [objectName(candidate[0]), objectName(candidate[1])];
    }
  }

  return [
    display(
      findValue(match, ["home_team_name", "team_a_name", "team1_name"]),
      ""
    ),
    display(
      findValue(match, ["away_team_name", "team_b_name", "team2_name"]),
      ""
    ),
  ];
}

function scoreText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(scoreText).filter(Boolean).join(" & ");
  }
  if (isObject(value)) {
    if (value.score !== undefined) return scoreText(value.score);
    const runs = value.runs ?? value.total ?? value.score_value;
    const wickets = value.wickets ?? value.wkts ?? value.out;
    const overs = value.overs ?? value.over;
    if (runs !== undefined) {
      return `${runs}${wickets !== undefined ? `/${wickets}` : ""}${
        overs !== undefined ? ` (${overs})` : ""
      }`;
    }
  }
  return "";
}

function scoresFor(match) {
  const pairs = [
    [match?.home_score, match?.away_score],
    [match?.homeScore, match?.awayScore],
    [match?.team_a_score, match?.team_b_score],
    [match?.teamAScore, match?.teamBScore],
    [match?.team1Score, match?.team2Score],
  ];

  for (const [first, second] of pairs) {
    if (first !== undefined || second !== undefined) {
      return [scoreText(first), scoreText(second)];
    }
  }

  if (Array.isArray(match?.scores) && match.scores.length >= 2) {
    return [scoreText(match.scores[0]), scoreText(match.scores[1])];
  }

  return ["", ""];
}

function renderFeatured() {
  const matches = featuredMatchArray(state.featured?.data);
  el.featuredCount.textContent = `${matches.length} ${
    matches.length === 1 ? "match" : "matches"
  }`;

  if (!matches.length) {
    el.featuredMatches.innerHTML = `
      <div class="empty">
        I could not identify the match list automatically. Open the
        <strong>Raw JSON</strong> tab to see the full response and adjust the
        field mapping in <code>public/app.js</code> if Sportskeeda changed it.
      </div>`;
    return;
  }

  el.featuredMatches.innerHTML = matches
    .slice(0, 24)
    .map((match, index) => {
      const [teamOne, teamTwo] = teamsFor(match);
      const [scoreOne, scoreTwo] = scoresFor(match);
      const title =
        match.match_title ??
        match.matchTitle ??
        match.title ??
        match.name ??
        match.match_name ??
        match.match_number_with_format ??
        `Featured match ${index + 1}`;
      const competition =
        match.series_name ??
        match.seriesName ??
        match.competition_name ??
        match.tournament_name ??
        match.league_name ??
        "Featured cricket";
      const status =
        match.match_status ??
        match.matchStatus ??
        match.status ??
        match.result ??
        match.match_result ??
        match.state ??
        "See raw JSON for additional details";

      return `
        <article class="match-card">
          <div class="competition">${escapeHtml(display(competition))}</div>
          <h3>${escapeHtml(display(title))}</h3>
          <div class="teams">
            <div class="team-row">
              <strong>${escapeHtml(teamOne || "Team 1")}</strong>
              <span>${escapeHtml(scoreOne || "—")}</span>
            </div>
            <div class="team-row">
              <strong>${escapeHtml(teamTwo || "Team 2")}</strong>
              <span>${escapeHtml(scoreTwo || "—")}</span>
            </div>
          </div>
          <div class="match-status">${escapeHtml(display(status))}</div>
        </article>`;
    })
    .join("");
}

function matchValue(keys, fallback = "—") {
  return display(findValue(state.match?.data, keys), fallback);
}

function commentaryArray() {
  const data = state.match?.data;
  const direct = [
    data?.dirty,
    data?.commentary,
    data?.comments,
    data?.ball_by_ball,
    data?.ballByBall,
  ];

  for (const candidate of direct) {
    if (
      Array.isArray(candidate) &&
      candidate.some((item) => isObject(item) && item.comment_text)
    ) {
      return candidate;
    }
  }

  return (
    collectArrays(data)
      .filter(({ value }) =>
        value.some((item) => isObject(item) && item.comment_text)
      )
      .sort((a, b) => b.value.length - a.value.length)[0]?.value || []
  );
}

function latestScore() {
  const comments = commentaryArray();
  const scoreComment = comments.find((item) => item?.score);
  return (
    scoreText(state.match?.data?.score) ||
    scoreText(state.match?.data?.current_score) ||
    display(scoreComment?.score, "—")
  );
}

function row(label, value) {
  return `
    <div class="data-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(display(value))}</dd>
    </div>`;
}

function renderMatch() {
  const data = state.match?.data || {};
  const weather = data.weather_info_by_one_weather || data.weather || {};
  const player = data.player_of_match || {};
  const probabilities = data.team_win_probability || {};
  const pitch = data.pitch || {};

  const resultComment = commentaryArray().find((item) =>
    /end of match|win by|won by/i.test(stripHtml(item?.comment_text || ""))
  );

  const result =
    stripHtml(resultComment?.comment_text || "") ||
    matchValue(["match_result", "result", "winning_margin"], "Result unavailable");

  const probabilityText = Object.entries(probabilities)
    .map(([team, percent]) => `${team}: ${percent}%`)
    .join(" • ");

  el.summaryCards.innerHTML = [
    ["Current / final score", latestScore()],
    ["Result", result],
    ["Player of the match", player.player_name || "—"],
    ["Winning margin", data.winning_margin || "—"],
  ]
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <span class="summary-label">${escapeHtml(label)}</span>
          <strong class="summary-value">${escapeHtml(display(value))}</strong>
        </article>`
    )
    .join("");

  el.matchInfo.innerHTML = [
    ["Match", data.match_number_with_format || data.match_number || "2nd ODI"],
    ["Match ID", data.match_id],
    ["Latest innings", data.latest_inning_number],
    ["Toss decision", data.toss_decision],
    ["Player of match stat", player.bowling_stat || player.batting_stat],
    ["Commentary language", data.is_english_commentary ? "English" : "Unknown"],
  ]
    .map(([label, value]) => row(label, value))
    .join("");

  el.conditions.innerHTML = [
    ["Weather", weather.weather_condition || weather.weather],
    ["Temperature", weather.temp ? `${weather.temp} °C` : "—"],
    ["Humidity", weather.humidity ? `${weather.humidity}%` : "—"],
    ["Wind", weather.wind_speed ? `${weather.wind_speed}` : "—"],
    ["Pitch", pitch.pitch_condition],
    ["Win probability", probabilityText || "—"],
  ]
    .map(([label, value]) => row(label, value))
    .join("");

  const overs = Array.isArray(data.overs_timeline_v2)
    ? data.overs_timeline_v2
    : [];

  el.overs.innerHTML = overs.length
    ? overs
        .slice(0, 12)
        .map(
          (over) => `
            <div class="over-card">
              <div class="over-head">
                <span>Over ${escapeHtml(display(over.over))}</span>
                <strong>${escapeHtml(display(over.runs, "0"))} runs</strong>
              </div>
              <div class="balls">
                ${(Array.isArray(over.summary) ? over.summary : [])
                  .map((ball) => `<span class="ball">${escapeHtml(ball)}</span>`)
                  .join("")}
              </div>
            </div>`
        )
        .join("")
    : `<div class="empty">No recent-over timeline was present in this response.</div>`;
}

function renderCommentary() {
  const comments = commentaryArray()
    .filter((item) => item?.comment_text)
    .slice(0, 60);

  el.commentaryCount.textContent = `${comments.length} updates`;

  el.commentary.innerHTML = comments.length
    ? comments
        .map((item) => {
          const clean = stripHtml(item.comment_text);
          const over =
            item.over ||
            clean.match(/^\d+(?:\.\d+)?/)?.[0] ||
            (item.opta_ball_type === "end of over" ? "Over end" : "Update");
          return `
            <article class="comment">
              <div class="comment-over">${escapeHtml(display(over))}</div>
              <p>${escapeHtml(clean)}</p>
            </article>`;
        })
        .join("")
    : `<div class="empty">No commentary items were found.</div>`;
}

function renderRaw() {
  const selected = el.rawSelector.value;
  const value = selected === "match" ? state.match : state.featured;
  el.rawJson.textContent = JSON.stringify(value, null, 2);
}

function renderAll() {
  renderFeatured();
  renderMatch();
  renderCommentary();
  renderRaw();
}

function setStatus(kind, message) {
  el.statusDot.className = `status-dot ${kind}`;
  el.statusText.textContent = message;
}

async function fetchEndpoint(url) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Request failed with HTTP ${response.status}`);
  }

  return payload;
}

async function loadData() {
  el.refresh.disabled = true;
  setStatus("loading", "Loading both cricket feeds…");

  const results = await Promise.allSettled([
    fetchEndpoint("/api/featured"),
    fetchEndpoint("/api/match"),
  ]);

  if (results[0].status === "fulfilled") state.featured = results[0].value;
  if (results[1].status === "fulfilled") state.match = results[1].value;

  const failures = results.filter((result) => result.status === "rejected");

  if (failures.length === 0) {
    setStatus("ready", "Both cricket feeds loaded successfully");
  } else if (failures.length === 1) {
    setStatus("error", `One feed failed: ${failures[0].reason.message}`);
  } else {
    setStatus("error", `Both feeds failed: ${failures[0].reason.message}`);
  }

  renderAll();
  el.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  el.refresh.disabled = false;
}

function configureAutoRefresh() {
  clearInterval(state.timer);
  state.timer = null;

  if (el.autoRefresh.checked) {
    state.timer = setInterval(loadData, 30_000);
  }
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) =>
      tab.classList.toggle("active", tab === button)
    );
    document.querySelectorAll(".panel").forEach((panel) =>
      panel.classList.toggle(
        "active",
        panel.id === `${button.dataset.panel}Panel`
      )
    );
  });
});

el.refresh.addEventListener("click", loadData);
el.autoRefresh.addEventListener("change", configureAutoRefresh);
el.rawSelector.addEventListener("change", renderRaw);
el.copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(el.rawJson.textContent);
    const oldText = el.copyButton.textContent;
    el.copyButton.textContent = "Copied";
    setTimeout(() => (el.copyButton.textContent = oldText), 1200);
  } catch {
    setStatus("error", "Browser blocked clipboard access");
  }
});

configureAutoRefresh();
loadData();
