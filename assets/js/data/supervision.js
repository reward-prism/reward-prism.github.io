window.PRISM_DATA = window.PRISM_DATA || {};
window.PRISM_DATA.supervision = {
  fps: 30,
  frames: 1117,
  completedSubtasks: 6,
  totalSubtasks: 9,
  outcome: 1,
  minimumTimeToCapSeconds: 9,
  preFailureCap: 0.95,
  intervals: [
    { start: 0, end: 249, quality: "nominal" },
    { start: 250, end: 820, quality: "regressed" },
    { start: 821, end: 1116, quality: "nominal" }
  ]
};
