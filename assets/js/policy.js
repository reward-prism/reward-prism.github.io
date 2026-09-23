(() => {
  "use strict";
  const host = document.getElementById("policy-player");
  if (!host) return;
  const BASE = new URL("../../", document.currentScript.src).href;
  const VIEWS = ["top", "left", "right", "bottom"];
  const TASKS = [
    {
      id: "airplane", name: "Airplane model assembly", count: 9, dur: 167.333333, assembly: true,
      meta: "Progress-weighted policy · Iter2",
      overview: "Two wings · screw insertion · drill handoffs",
      challenge: "Place each wing flush against the body, insert and fasten its screw, then reorient the plane for the other wing. Parts and the drill pass between the two arms.",
    },
    {
      id: "car", name: "Car model assembly", count: 10, dur: 262.666992, assembly: true,
      meta: "Progress-weighted policy · Iter2",
      overview: "Four wheels · four screws · both sides of the car",
      challenge: "Fit and fasten both wheels on one side, flip and rotate the car, then assemble the other side. The final screw requires stabilizing the car while picking the drill back up.",
    },
    { id: "star", name: "Star insertion", count: 1, meta: "Offline RL · Zero-shot reward prediction from our pretrained model", dur: 15.333333, challenge: "Align the star with the matching opening and insert it." },
    { id: "tube", name: "Tube transfer", count: 3, meta: "Offline RL · Zero-shot reward prediction from our pretrained model", dur: 33.766667, challenge: "Transfer the tube from a box to a rack across three subtasks." },
  ];
  const playbackRates = new Map(TASKS.map((task) => [task.id, 4]));
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v === true ? "" : v); } for (const c of kids) if (c != null) n.append(c); return n; };
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const tabs = el("div", { class: "policy-tabs policy-task-picker", role: "tablist", "aria-label": "Real-world policy evaluation task" });
  const tabButtons = TASKS.map((t) => {
    const button = el("button", {
      id: `policy-tab-${t.id}`, class: "policy-task-tab",
      type: "button", role: "tab", "aria-selected": "false", "aria-controls": "policy-active-panel", tabindex: "-1", "data-task": t.id,
    }, el("span", { class: "policy-task-name", text: t.name }));
    if (t.assembly) button.firstElementChild.append(el("span", { class: "policy-task-count", text: `(contains ${t.count} subtasks)` }));
    return button;
  });
  tabButtons.forEach((b) => tabs.append(b));

  const grid = el("div", { class: "policy-grid" });
  const videos = VIEWS.map((v) => {
    const video = el("video", { preload: "none", muted: true, playsinline: true, "aria-label": `${v} camera` });
    video.muted = true;
    const cell = el("div", { class: "policy-cell" }, video, el("span", { class: "policy-view", text: v.toUpperCase() }));
    grid.append(cell);
    return video;
  });
  const master = videos[0];
  const playBtn = el("button", { class: "btn", type: "button", text: "Play" });
  const back = el("button", { class: "btn", type: "button", text: "−5 s" });
  const fwd = el("button", { class: "btn", type: "button", text: "+5 s" });
  const seek = el("input", { type: "range", min: 0, max: 1, step: 0.01, value: 0, "aria-label": "time" });
  const time = el("span", { class: "policy-time mono", text: "0:00 / 0:00" });
  const rate = el("select", { "aria-label": "speed" }, ...[0.5, 1, 2, 4].map((r) => el("option", { value: r, text: `${r}×`, selected: r === 4 || null })));
  const transport = el("div", { class: "controls policy-transport" }, playBtn, back, fwd, seek, time, rate);
  const viewer = el("div", { class: "policy-viewer" }, grid, transport);
  const caption = el("p", { class: "policy-caption" });
  const contextTitle = el("h3", { id: "policy-active-title" });
  const contextMeta = el("p", { class: "policy-task-meta" });
  const taskAnchors = TASKS.map((task) => el("span", { id: `policy-${task.id}`, class: "policy-task-anchor", "aria-hidden": "true" }));
  const identity = el("header", { class: "policy-task-identity" }, ...taskAnchors, contextTitle, contextMeta);
  const overview = el("p", { class: "policy-task-overview" });
  const contextDescription = el("p");
  const context = el("div", { class: "policy-task-context" }, overview, contextDescription, caption);
  const panel = el("div", { id: "policy-active-panel", class: "policy-active-panel", role: "tabpanel", tabindex: "0" }, identity, viewer);
  const card = el("div", { class: "card policy-card" }, panel, tabs, context);
  host.append(card);

  let current = null, loaded = false, syncTimer = 0;
  const all = (fn) => videos.forEach(fn);
  function load(task, { updateHash = true } = {}) {
    current = task; loaded = false;
    pause();
    rate.value = String(playbackRates.get(task.id));
    all((v, i) => { v.pause(); v.removeAttribute("src"); v.load(); v.poster = `${BASE}assets/video/policy/${task.id}-${VIEWS[i]}.jpg`; v.src = `${BASE}assets/video/policy/${task.id}-${VIEWS[i]}.mp4`; v.defaultPlaybackRate = v.playbackRate = Number(rate.value); v.currentTime = 0; });
    seek.value = 0; seek.max = task.dur; time.textContent = `0:00 / ${mmss(task.dur)}`;
    contextTitle.textContent = task.name;
    if (task.assembly) contextTitle.append(" ", el("span", { class: "policy-task-count", text: `(contains ${task.count} subtasks)` }));
    contextMeta.textContent = `${task.assembly ? "" : `${task.count} ${task.count === 1 ? "subtask" : "subtasks"} · `}${mmss(task.dur)} shown episode`;
    overview.textContent = task.overview || "";
    overview.hidden = !task.overview;
    contextDescription.textContent = task.challenge;
    caption.textContent = `${task.meta}. Source duration: ${mmss(task.dur)}.`;
    panel.setAttribute("aria-labelledby", `policy-tab-${task.id}`);
    tabButtons.forEach((b) => {
      const on = b.dataset.task === task.id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    if (updateHash) history.replaceState(history.state, "", `#policy-${task.id}`);
  }
  function play() { all((v) => { v.playbackRate = parseFloat(rate.value); }); Promise.allSettled(videos.map((v) => v.play())).then(() => { playBtn.textContent = "Pause"; loaded = true; }); syncTimer = syncTimer || setInterval(sync, 500); }
  function pause() { all((v) => v.pause()); playBtn.textContent = "Play"; clearInterval(syncTimer); syncTimer = 0; }
  function sync() {
    const t = master.currentTime;
    videos.slice(1).forEach((v) => { if (Math.abs(v.currentTime - t) > 0.15) v.currentTime = t; });
    seek.value = t; time.textContent = `${mmss(t)} / ${mmss(current ? current.dur : master.duration || 0)}`;
  }
  function seekTo(t) { const d = master.duration || (current && current.dur) || 0; t = Math.max(0, Math.min(d, t)); all((v) => { v.currentTime = t; }); seek.value = t; time.textContent = `${mmss(t)} / ${mmss(d)}`; }
  playBtn.addEventListener("click", () => (master.paused ? play() : pause()));
  back.addEventListener("click", () => seekTo(master.currentTime - 5));
  fwd.addEventListener("click", () => seekTo(master.currentTime + 5));
  seek.addEventListener("input", () => seekTo(parseFloat(seek.value)));
  rate.addEventListener("change", () => {
    playbackRates.set(current.id, Number(rate.value));
    all((v) => { v.defaultPlaybackRate = v.playbackRate = Number(rate.value); });
  });
  master.addEventListener("ended", pause);
  master.addEventListener("timeupdate", () => { if (!syncTimer) sync(); });
  grid.addEventListener("click", () => (master.paused ? play() : pause()));
  tabButtons.forEach((b) => b.addEventListener("click", () => load(TASKS.find((t) => t.id === b.dataset.task))));
  tabs.addEventListener("keydown", (event) => {
    const index = tabButtons.indexOf(document.activeElement);
    if (index < 0) return;
    let next;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabButtons.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabButtons.length) % tabButtons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabButtons.length - 1;
    else return;
    event.preventDefault();
    tabButtons[next].focus();
    load(TASKS[next]);
  });
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => { for (const e of es) if (!e.isIntersecting && !master.paused) pause(); }, { threshold: 0.05 }).observe(card);
  const fromHash = TASKS.find((t) => location.hash === `#policy-${t.id}`);
  load(fromHash || TASKS[0], { updateHash: false });
  window.addEventListener("hashchange", () => {
    const task = TASKS.find((t) => location.hash === `#policy-${t.id}`);
    if (task && task !== current) load(task, { updateHash: false });
  });
  if (reduced) all((v) => { v.autoplay = false; });
  window.PRISM = window.PRISM || {}; window.PRISM.policy = { load, play, pause, seekTo, TASKS, VIEWS };
})();
