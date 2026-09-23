(() => {
  "use strict";
  const root = document.getElementById("supervision-example");
  const data = window.PRISM_DATA && window.PRISM_DATA.supervision;
  if (!root || !data) return;
  const find = (selector) => root.querySelector(selector);
  const video = find("#supervision-video");
  const chart = find("[data-supervision-chart]");
  const play = find("[data-supervision-play]");
  const seek = find("[data-supervision-seek]");
  const playbackRate = 4;
  const time = find("[data-supervision-time]");
  const status = find("[data-supervision-status]");
  const error = find("[data-supervision-error]");
  const localValue = find("[data-supervision-local-value]");
  const wholeValue = find("[data-supervision-whole-value]");
  const [attempt, failure, recovery] = data.intervals;
  const frameCount = data.frames, lastFrame = frameCount - 1;
  const duration = frameCount / data.fps;
  seek.max = lastFrame;
  const attemptResetDuration = (failure.start - attempt.start) / data.fps;
  const attemptUpdateDuration = (attempt.end - attempt.start) / data.fps;
  const attemptEndpoint = data.preFailureCap * Math.min(1, attemptResetDuration / data.minimumTimeToCapSeconds);
  const segments = {
    attempt: { start: attempt.start / data.fps, end: failure.start / data.fps, seek: attempt.start, branch: "interrupted" },
    failure: { start: failure.start / data.fps, end: recovery.start / data.fps, seek: failure.start, branch: "regressed" },
    recovery: { start: failure.end / data.fps, end: recovery.end / data.fps, seek: recovery.start, branch: "boundary" }
  };
  const segmentButtons = [...root.querySelectorAll("[data-supervision-segment]")];
  const branches = [...document.querySelectorAll("[data-supervision-branch]")];
  for (const name of ["attempt", "recovery"]) {
    const segment = segments[name];
    find(`[data-supervision-duration="${name}"]`).textContent = (segment.end - segment.start).toFixed(2);
    find(`[data-supervision-window="${name}"]`).textContent = `${segment.start.toFixed(2)} → ${segment.end.toFixed(2)} s`;
  }
  find("[data-supervision-credit]").textContent = `${data.completedSubtasks}/${data.totalSubtasks}`;
  const targets = Array.from({ length: frameCount }, (_, frame) => {
    if (frame >= failure.start && frame <= failure.end) return 0;
    if (frame >= recovery.start) return data.outcome * (frame - recovery.start + 1) / (recovery.end - recovery.start + 1);
    const elapsedSeconds = (frame - attempt.start) / data.fps;
    return attemptEndpoint * elapsedSeconds / attemptUpdateDuration;
  });
  const svgNS = "http://www.w3.org/2000/svg";
  let frame = 0, geometry, cursor, dot, reveal, activeWindow, activeAnnotation, lastPhase = "";
  let operation = 0, videoFrameCallback = 0, animation = 0;
  const clampFrame = (value) => Math.max(0, Math.min(lastFrame, Math.round(Number(value) || 0)));
  const format = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
  function svgElement(tag, attributes, content) {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attributes || {}).forEach(([key, value]) => node.setAttribute(key, value));
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function showFrame(value) {
    frame = clampFrame(value);
    const local = targets[frame];
    root.dataset.frame = frame;
    root.dataset.localProgress = local;
    root.dataset.globalProgress = (data.completedSubtasks + local) / data.totalSubtasks;
    const endpoint = local === 0 || local === 1;
    localValue.textContent = endpoint ? `= ${local}` : `≈ ${local.toFixed(3)}`;
    wholeValue.textContent = endpoint
      ? `= ${data.completedSubtasks + local}/${data.totalSubtasks}`
      : `≈ (${data.completedSubtasks} + ${local.toFixed(3)})/${data.totalSubtasks}`;
    seek.value = frame;
    seek.setAttribute("aria-valuetext", `${(frame / data.fps).toFixed(2)} seconds since the subtask began`);
    time.textContent = `${format(video.ended ? duration : frame / data.fps)} / ${format(duration)}`;
    const segmentName = frame < failure.start ? "attempt" : frame <= failure.end ? "failure" : "recovery";
    const segment = segments[segmentName];
    root.dataset.segment = segmentName;
    if (geometry) {
      const x = geometry.x(frame / data.fps), y = geometry.y(local);
      cursor.setAttribute("x1", x); cursor.setAttribute("x2", x);
      dot.setAttribute("cx", x); dot.setAttribute("cy", y);
      reveal.setAttribute("width", Math.max(0, x - geometry.left + 1));
      activeWindow.setAttribute("x", geometry.x(segment.start));
      activeWindow.setAttribute("width", geometry.x(segment.end) - geometry.x(segment.start));
      const annotation = segmentName === "attempt" ? attempt : segmentName === "failure" ? failure : recovery;
      activeAnnotation.setAttribute("x", geometry.x(annotation.start / data.fps));
      activeAnnotation.setAttribute("width", geometry.x((annotation.end + 1) / data.fps) - geometry.x(annotation.start / data.fps));
    }
    let phase = frame < failure.start ? "attempt" : frame <= failure.end ? "failure" : frame === lastFrame ? "complete" : "recovery";
    if (phase !== lastPhase) {
      segmentButtons.forEach((button) => button.setAttribute("aria-pressed", button.dataset.supervisionSegment === segmentName));
      branches.forEach((branch) => branch.classList.toggle("is-active", branch.dataset.supervisionBranch === segment.branch));
      status.textContent = {
        attempt: "Nominal execution · Six completed subtasks retain their credit.",
        failure: "Regressed execution · Local progress = 0; whole-task credit stays at 6/9.",
        recovery: "Recovery · Local progress builds again above the retained 6/9 credit.",
        complete: "Subtask complete · Local progress = 1; whole-task credit reaches 7/9."
      }[phase];
      lastPhase = phase;
    }
  }
  function draw() {
    const width = chart.clientWidth;
    if (!width) return;
    const compact = width < 430;
    const height = Math.max(300, Math.min(480, Math.round(width * .7)));
    const left = compact ? 57 : 68, right = width - 14, top = 86, bottom = height - 55;
    const x = (seconds) => left + seconds / duration * (right - left);
    const y = (local) => bottom - (local + .045) / 1.13 * (bottom - top);
    geometry = { width, height, left, right, top, bottom, x, y };
    const svg = svgElement("svg", { class: "supervision-chart", viewBox: `0 0 ${width} ${height}`, height, role: "img", "aria-labelledby": "supervision-chart-title supervision-chart-description" });
    svg.append(svgElement("title", { id: "supervision-chart-title" }, "Constructed whole-task progress from sparse annotations"));
    svg.append(svgElement("desc", { id: "supervision-chart-description" }, `The current subtask is stage ${data.completedSubtasks + 1} of ${data.totalSubtasks}. All times are seconds since the subtask began. At ${(failure.start / data.fps).toFixed(2)} seconds, local progress resets and whole-task progress returns to ${data.completedSubtasks}/${data.totalSubtasks}. It remains there through ${(failure.end / data.fps).toFixed(2)} seconds. Recovery begins at ${(recovery.start / data.fps).toFixed(2)} seconds and reaches ${(data.completedSubtasks + data.outcome)}/${data.totalSubtasks} at ${(lastFrame / data.fps).toFixed(2)} seconds.`));
    svg.append(svgElement("text", { x: left, y: 21, class: "supervision-plot-title" }, "Constructed whole-task target"));
    data.intervals.forEach((interval) => {
      const start = interval.start / data.fps, end = (interval.end + 1) / data.fps;
      const regressed = interval.quality === "regressed";
      svg.append(svgElement("rect", { x: x(start), y: 35, width: x(end) - x(start), height: 22, fill: regressed ? "var(--supervision-failure)" : "var(--surface-2)" }));
      if (regressed || !compact) svg.append(svgElement("text", { x: (x(start) + x(end)) / 2, y: 51, "text-anchor": "middle" }, regressed ? "Regressed" : "Nominal"));
    });
    svg.append(svgElement("text", { x: left, y: 75, "font-size": "12" }, "Sparse AQ annotations"));
    activeAnnotation = svgElement("rect", { y: 35, height: 22, class: "supervision-active-annotation" });
    svg.append(activeAnnotation);
    svg.append(svgElement("rect", { x: x(failure.start / data.fps), y: top, width: x(recovery.start / data.fps) - x(failure.start / data.fps), height: bottom - top, fill: "var(--supervision-failure)", opacity: .58 }));
    activeWindow = svgElement("rect", { y: top, height: bottom - top, class: "supervision-active-window" });
    svg.append(activeWindow);
    const ticks = compact ? [0, .5, 1] : [0, .25, .5, .75, 1];
    ticks.forEach((local) => {
      const yy = y(local);
      svg.append(svgElement("line", { x1: left, x2: right, y1: yy, y2: yy, class: local === 0 ? "supervision-credit" : "supervision-axis" }));
      svg.append(svgElement("text", { x: left - 8, y: yy + 4, "text-anchor": "end" }, `${data.completedSubtasks + local}/${data.totalSubtasks}`));
    });
    svg.append(svgElement("line", { x1: left, x2: left, y1: top, y2: bottom, class: "supervision-axis" }));
    svg.append(svgElement("line", { x1: left, x2: right, y1: bottom, y2: bottom, class: "supervision-axis" }));
    [0, 20].forEach((seconds) => {
      svg.append(svgElement("text", { x: x(seconds), y: bottom + 21, "text-anchor": seconds === 0 ? "start" : "middle" }, seconds));
    });
    const timeLabel = svgElement("text", { x: (left + right) / 2, y: height - 6, "text-anchor": "middle" }, "Subtask time, ");
    timeLabel.append(svgElement("tspan", { "font-style": "italic" }, "t"), svgElement("tspan", { "baseline-shift": "sub", "font-size": "10" }, "subtask"), svgElement("tspan", {}, " (s)"));
    svg.append(timeLabel);
    svg.append(svgElement("text", { x: 15, y: (top + bottom) / 2, transform: `rotate(-90 15 ${(top + bottom) / 2})`, "text-anchor": "middle" }, "Whole-task progress"));
    const path = targets.map((local, index) => `${index ? "L" : "M"}${x(index / data.fps).toFixed(3)},${y(local).toFixed(3)}`).join(" ");
    const defs = svgElement("defs");
    const clip = svgElement("clipPath", { id: "supervision-seen-frames" });
    reveal = svgElement("rect", { x: left - 1, y: top - 1, width: 1, height: bottom - top + 2 });
    clip.append(reveal); defs.append(clip); svg.append(defs);
    svg.append(svgElement("path", { d: path, class: "supervision-curve supervision-future" }));
    svg.append(svgElement("path", { d: path, class: "supervision-curve", "clip-path": "url(#supervision-seen-frames)" }));
    cursor = svgElement("line", { x1: left, x2: left, y1: 32, y2: bottom, class: "supervision-cursor" });
    dot = svgElement("circle", { cx: left, cy: y(0), r: 4, class: "supervision-dot" });
    svg.append(cursor, dot);
    chart.replaceChildren(svg);
    showFrame(frame);
  }
  function setError(message = "") { error.textContent = message; error.hidden = !message; }
  function fixPlaybackRate() {
    if (video.defaultPlaybackRate !== playbackRate) video.defaultPlaybackRate = playbackRate;
    if (video.playbackRate !== playbackRate) video.playbackRate = playbackRate;
  }
  function pause() { operation++; video.pause(); play.textContent = "Play"; }
  async function start() {
    const currentOperation = ++operation;
    setError();
    if (video.ended || video.currentTime >= lastFrame / data.fps) video.currentTime = 0;
    try {
      await video.play();
      if (currentOperation === operation) play.textContent = "Pause";
    } catch (failure) {
      if (currentOperation !== operation || failure.name === "AbortError") return;
      setError("Could not play the video. Try Play again.");
    }
  }
  function seekTo(value) {
    pause(); setError();
    const target = clampFrame(value);
    video.currentTime = (target + 0.5) / data.fps;
    showFrame(target);
  }
  function updateFromClock() { showFrame(video.ended ? lastFrame : Math.floor(video.currentTime * data.fps + .0001)); }
  function watchVideoFrames() {
    if (!video.requestVideoFrameCallback) return;
    videoFrameCallback = video.requestVideoFrameCallback((_, metadata) => {
      showFrame(Math.floor(metadata.mediaTime * data.fps + .0001));
      watchVideoFrames();
    });
  }
  function watchAnimation() {
    if (video.requestVideoFrameCallback || video.paused) return;
    updateFromClock(); animation = requestAnimationFrame(watchAnimation);
  }
  play.addEventListener("click", () => video.paused ? start() : pause());
  find("[data-supervision-replay]").addEventListener("click", () => { seekTo(0); start(); });
  seek.addEventListener("input", () => seekTo(seek.value));
  segmentButtons.forEach((button) => button.addEventListener("click", () => seekTo(segments[button.dataset.supervisionSegment].seek)));
  video.addEventListener("ratechange", fixPlaybackRate);
  video.addEventListener("play", () => { play.textContent = "Pause"; watchAnimation(); });
  video.addEventListener("pause", () => { play.textContent = "Play"; cancelAnimationFrame(animation); });
  video.addEventListener("ended", () => { pause(); showFrame(lastFrame); });
  video.addEventListener("seeked", updateFromClock);
  video.addEventListener("timeupdate", () => { if (!video.requestVideoFrameCallback) updateFromClock(); });
  video.addEventListener("loadedmetadata", () => {
    fixPlaybackRate();
    if (Math.abs(video.duration - duration) > 1 / data.fps) setError("Video duration does not match the annotated time range.");
  });
  video.addEventListener("error", () => setError("Could not load the video. Reload the page to retry."));
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  root.closest("details").addEventListener("toggle", (event) => { if (!event.target.open) pause(); });
  new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) pause(); }, { threshold: .01 }).observe(root);
  new ResizeObserver(draw).observe(chart);
  window.addEventListener("pagehide", () => {
    pause(); cancelAnimationFrame(animation);
    if (videoFrameCallback) video.cancelVideoFrameCallback(videoFrameCallback);
  });
  video.muted = true;
  fixPlaybackRate();
  draw(); watchVideoFrames();
})();
