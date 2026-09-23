(() => {
  "use strict";
  const host = document.getElementById("prediction-player");
  const items = window.PRISM_DATA && window.PRISM_DATA.predictions && window.PRISM_DATA.predictions.items;
  if (!host || !items || !items.length) return;
  const base = new URL("../../", document.currentScript.src);
  const el = (tag, attributes = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  };
  const format = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
  let current, generation = 0, operation = 0, intendedPlaying = false, syncId = 0;
  let frameCallback = 0, animationFrame = 0;
  let loadingAbort = new AbortController();
  const loads = new Map();
  const playbackSpeeds = new Map(items.map((item) => [item.id, item.defaultPlaybackRate ?? 2]));
  const asset = (name) => new URL(`assets/video/predictions/${current.id}/${name}`, base).href;
  const makeVideo = (label, className) => {
    const video = el("video", { class: className, playsinline: "", muted: "", preload: "none", "aria-label": label });
    video.muted = true;
    return video;
  };
  const cameras = makeVideo("Four camera views of the selected prediction clip", "prediction-cameras prediction-cameras--grid");
  const curve = makeVideo("Synchronized model predictions and reference curve", "prediction-curve");
  const videos = [cameras, curve];
  const hasVideoFrames = typeof curve.requestVideoFrameCallback === "function";
  function makeFutureOverlay() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "prediction-future-overlay");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("aria-hidden", "true");
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("class", "prediction-future-region");
    svg.append(rect);
    return { svg, rect };
  }
  const future = makeFutureOverlay();
  const tabs = el("div", { class: "prediction-tabs", role: "tablist", "aria-label": "Prediction comparison tasks" });
  const buttons = items.map((item) => {
    const button = el("button", { id: `prediction-${item.id}`, class: "prediction-tab", type: "button", role: "tab",
      "aria-controls": "prediction-panel", "aria-selected": "false", tabindex: "-1" },
      el("span", { text: item.title }),
      el("span", { class: "prediction-subtask-count", text: `(up to ${item.subtaskCount} subtasks)` }));
    button.addEventListener("click", () => select(item, true));
    return button;
  });
  tabs.append(...buttons);
  const title = el("h3", { id: "prediction-title" });
  const event = el("p", { class: "prediction-event" });
  const description = el("p", { class: "prediction-description" });
  const play = el("button", { type: "button", class: "btn btn--primary", text: "Play" });
  const replay = el("button", { type: "button", class: "btn", text: "Replay" });
  const seek = el("input", { type: "range", min: "0", step: String(1 / 30), value: "0", "aria-label": "Prediction clip time" });
  const timestamp = el("output", { class: "prediction-time" });
  const speed = el("select", { "aria-label": "Prediction playback speed" },
    ...[0.25, 0.5, 1, 2].map((value) => el("option", { value: String(value), text: `${value}×` })));
  const status = el("div", { class: "prediction-status", role: "status" });
  const transport = el("div", { class: "prediction-transport" }, play, replay, seek, timestamp,
    el("label", { class: "prediction-speed" }, el("span", { text: "Speed" }), speed));
  const curveWrap = el("div", { class: "prediction-curve-wrap" }, curve, future.svg);
  const panel = el("article", { class: "card prediction-panel", id: "prediction-panel", role: "tabpanel", tabindex: "0" },
    el("header", { class: "prediction-heading" }, title, event, description),
    el("div", { class: "prediction-media-grid" },
      el("div", { class: "prediction-camera-wrap" }, cameras), curveWrap),
    transport,
    status);
  host.replaceChildren(tabs, panel);

  function applySpeed() {
    const rate = playbackSpeeds.get(current.id);
    videos.forEach((video) => {
      video.defaultPlaybackRate = rate;
      video.playbackRate = rate;
    });
  }
  function revealThrough(overlay, time) {
    const plot = current.plot;
    const [left, top, right, bottom] = plot.bounds;
    const frame = Math.min(plot.frames - 1, Math.max(0, Math.floor(time * plot.fps + 0.0001)));
    const fraction = Math.min(1, frame / plot.fps / plot.timeSpan);
    const cursor = Math.floor(left + (right - left) * fraction);
    const x = Math.min(right, cursor + 2);
    overlay.svg.setAttribute("viewBox", `0 0 ${plot.width} ${plot.height}`);
    overlay.rect.setAttribute("x", x);
    overlay.rect.setAttribute("y", top - 5);
    overlay.rect.setAttribute("width", Math.max(0, right - x));
    overlay.rect.setAttribute("height", bottom - top + 10);
    overlay.svg.dataset.frame = frame;
  }
  function showFrame(time) {
    revealThrough(future, time);
  }
  function watchFrames() {
    if (frameCallback) curve.cancelVideoFrameCallback(frameCallback);
    if (!hasVideoFrames) return;
    const selectedGeneration = generation;
    const next = (_, metadata) => {
      if (selectedGeneration !== generation) return;
      showFrame(metadata.mediaTime);
      frameCallback = curve.requestVideoFrameCallback(next);
    };
    frameCallback = curve.requestVideoFrameCallback(next);
  }
  function animateFallback() {
    if (hasVideoFrames || !intendedPlaying) return;
    showFrame(curve.currentTime);
    animationFrame = requestAnimationFrame(animateFallback);
  }
  function stopSync() { clearInterval(syncId); syncId = 0; }
  function pause() {
    operation++; intendedPlaying = false; videos.forEach((video) => video.pause());
    stopSync(); cancelAnimationFrame(animationFrame);
    play.textContent = "Play"; status.textContent = "";
  }
  function ready(video) {
    if (video.readyState >= 1) return Promise.resolve();
    const src = video.src, previous = loads.get(video);
    if (previous && previous.src === src) return previous.promise;
    const signal = loadingAbort.signal;
    const promise = new Promise((resolve, reject) => {
      let timeout;
      const cleanup = () => { clearTimeout(timeout); for (const name of ["loadedmetadata", "error"]) video.removeEventListener(name, handle); signal.removeEventListener("abort", abort); };
      const abort = () => { cleanup(); reject(new Error("Media load was interrupted.")); };
      const handle = (event) => {
        cleanup();
        if (event.type === "loadedmetadata" && video.src === src) resolve();
        else reject(new Error("Media load was interrupted."));
      };
      for (const name of ["loadedmetadata", "error"]) video.addEventListener(name, handle);
      signal.addEventListener("abort", abort, { once: true });
      video.preload = "auto"; video.load();
      timeout = setTimeout(() => { cleanup(); reject(new Error("Media load timed out.")); }, 15000);
    });
    loads.set(video, { src, promise });
    promise.catch(() => { if (loads.get(video)?.promise === promise) loads.delete(video); });
    return promise;
  }
  function updateTime() {
    const time = curve.currentTime || 0;
    seek.value = time;
    timestamp.textContent = `${format(time)} / ${format(current.duration)}`;
    if (!hasVideoFrames) showFrame(time);
  }
  function synchronize() {
    if (Math.abs(cameras.currentTime - curve.currentTime) > 0.075 && cameras.readyState >= 1) cameras.currentTime = curve.currentTime;
    updateTime();
  }
  async function start() {
    const thisOperation = ++operation, thisGeneration = generation;
    intendedPlaying = true; play.textContent = "Pause"; status.textContent = "Loading clip…";
    try {
      await Promise.all(videos.map(ready));
      if (thisOperation !== operation || thisGeneration !== generation) return;
      if (curve.ended || curve.currentTime >= current.duration - 1 / 30) videos.forEach((video) => { video.currentTime = 0; });
      cameras.currentTime = curve.currentTime;
      applySpeed();
      await Promise.all(videos.map((video) => video.play()));
      if (thisOperation !== operation || thisGeneration !== generation) return;
      status.textContent = ""; stopSync(); syncId = setInterval(synchronize, 100);
      cancelAnimationFrame(animationFrame); animateFallback();
    } catch (_) {
      if (thisOperation !== operation || thisGeneration !== generation) return;
      pause(); status.textContent = "Could not load this clip. Try Play again.";
    }
  }
  async function seekTo(value) {
    pause();
    const thisOperation = operation, thisGeneration = generation;
    const target = Math.max(0, Math.min(current.duration, Number(value)));
    try {
      await Promise.all(videos.map(ready));
      if (thisOperation !== operation || thisGeneration !== generation) return;
      videos.forEach((video) => { video.currentTime = Math.min(target, video.duration); });
      updateTime();
    } catch (_) {
      if (thisOperation === operation && thisGeneration === generation) status.textContent = "Could not seek. Try Play first.";
    }
  }
  function setCameraSource() {
    cameras.poster = asset("cameras.jpg");
    cameras.src = asset("cameras.mp4");
    cameras.preload = "none";
  }
  function select(item, changeHash = false) {
    pause(); loadingAbort.abort(); loadingAbort = new AbortController(); loads.clear(); generation++; current = item;
    speed.value = String(playbackSpeeds.get(item.id));
    title.textContent = item.title; event.textContent = item.event;
    description.textContent = item.description;
    seek.max = item.duration;
    curveWrap.style.aspectRatio = `${item.plot.width} / ${item.plot.height}`;
    curve.width = item.plot.width;
    curve.height = item.plot.height;
    setCameraSource();
    curve.preload = "none"; curve.poster = asset("curve.png"); curve.src = asset("curve.mp4");
    videos.forEach((video) => video.load());
    applySpeed(); showFrame(0); watchFrames();
    seek.value = 0;
    timestamp.textContent = `${format(0)} / ${format(item.duration)}`;
    panel.setAttribute("aria-labelledby", `prediction-${item.id}`);
    buttons.forEach((button, index) => {
      const active = items[index] === item;
      button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
    });
    if (changeHash) history.replaceState(history.state, "", `#prediction-${item.id}`);
  }
  play.addEventListener("click", () => intendedPlaying ? pause() : start());
  replay.addEventListener("click", async () => { const selected = current; await seekTo(0); if (current === selected) start(); });
  seek.addEventListener("input", () => seekTo(seek.value));
  speed.addEventListener("change", () => {
    playbackSpeeds.set(current.id, Number(speed.value));
    applySpeed();
  });
  curve.addEventListener("timeupdate", updateTime);
  curve.addEventListener("loadedmetadata", applySpeed);
  cameras.addEventListener("loadedmetadata", applySpeed);
  curve.addEventListener("seeked", () => { if (!hasVideoFrames) showFrame(curve.currentTime); });
  curve.addEventListener("ended", pause);
  cameras.addEventListener("click", () => intendedPlaying ? pause() : start());
  tabs.addEventListener("keydown", (event) => {
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    let next;
    if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (index + 1) % buttons.length;
    else if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (index + buttons.length - 1) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else return;
    event.preventDefault(); buttons[next].focus(); select(items[next], true);
  });
  if ("IntersectionObserver" in window) new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting && intendedPlaying) pause();
  }, { threshold: 0.01 }).observe(panel);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("hashchange", () => {
    const item = items.find((entry) => location.hash === `#prediction-${entry.id}`);
    if (item && item !== current) select(item);
  });
  select(items.find((item) => location.hash === `#prediction-${item.id}`) || items[0]);
})();
