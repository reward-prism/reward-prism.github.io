(() => {
  "use strict";
  const DATA = window.PRISM_DATA || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  }

  function renderTasks() {
    const host = $("#task-gallery");
    const data = DATA.tasks;
    if (!host || !data) return;
    const base = new URL("../../", document.currentScript.src).href;
    const items = [...data.items].sort((x, y) => ((x.rank ?? 1e9) - (y.rank ?? 1e9)) || x.seq - y.seq);
    for (const it of items) {
      host.append(el("figure", { class: "tile" },
        el("img", { src: base + it.img, alt: `${it.task} — top camera frame`, loading: "lazy", title: it.instruction || null }),
        el("figcaption", { text: it.task })));
    }
  }

  function navHighlight() {
    const sections = $$("main > section[id]");
    const links = new Map($$(".anchors a[href^='#']").map((a) => [a.getAttribute("href").slice(1), a]));
    const segs = new Map($$(".specbar li[data-for]").map((li) => [li.dataset.for, li]));
    let current = null;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 56;
    function update() {
      const probe = navH + window.innerHeight * 0.35;
      let active = null;
      for (const s of sections) if (s.getBoundingClientRect().top <= probe) active = s.id;
      if (active === current) return;
      current = active;
      for (const [id, a] of links) a.toggleAttribute("aria-current", id === active);
      for (const [id, li] of segs) li.toggleAttribute("aria-current", id === active);
    }
    let raf = 0;
    window.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  function methodNavigation() {
    let pendingScroll = 0;
    function reveal(hash) {
      let id;
      try { id = decodeURIComponent(hash.slice(1)); } catch (_) { return; }
      const target = document.getElementById(id);
      if (!target || !target.closest("details.rule-details")) return;
      for (let details = target.closest("details"); details; details = details.parentElement && details.parentElement.closest("details")) details.open = true;
      cancelAnimationFrame(pendingScroll);
      pendingScroll = requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    }
    window.addEventListener("hashchange", () => reveal(location.hash));
    for (const link of $$(".method-nav a[href^='#']")) {
      link.addEventListener("click", () => {
        if (link.hash === location.hash) reveal(link.hash);
      });
    }
    reveal(location.hash);
  }

  function bibtex() {
    const button = $("#copy-bibtex");
    const pre = $("#bibtex-text");
    if (!button || !pre) return;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent.trim());
        const old = button.textContent; button.textContent = "Copied";
        setTimeout(() => { button.textContent = old; }, 1600);
      } catch (_) { button.textContent = "Select & copy"; }
    });
  }

  function math() {
    if (typeof window.renderMathInElement !== "function") return;
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
    });
  }

  renderTasks();
  navHighlight();
  bibtex();
  math();
  methodNavigation();
})();
