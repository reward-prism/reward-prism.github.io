(() => {
  const groups = [...document.querySelectorAll('.evaluation-nav')].map(nav => {
    const links = [...nav.querySelectorAll('a[href^="#"]')];
    const targets = links.map(link => document.getElementById(link.hash.slice(1)));
    return { nav, links, targets };
  }).filter(group => group.targets.length && group.targets.every(Boolean));
  if (!groups.length) return;
  let frame = 0;

  function update() {
    frame = 0;
    const headerHeight = document.querySelector('.topnav').getBoundingClientRect().height;
    groups.forEach(({ nav, links, targets }) => {
      if (!nav.getClientRects().length) return;
      const probe = headerHeight + nav.getBoundingClientRect().height + 32;
      let selected = 0;
      targets.forEach((target, index) => {
        if (target.getBoundingClientRect().top <= probe) selected = index;
      });
      links.forEach((link, index) => {
        if (index === selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('load', schedule, { once: true });
  groups.forEach(({ nav }) => nav.closest('details')?.addEventListener('toggle', schedule));
  update();
})();
