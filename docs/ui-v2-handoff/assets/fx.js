/* fx.js — mockup runtime: auto-renders <i data-ic> icons and boots wave canvases.
   Waves: <canvas data-wave data-accent="#fab387" data-bg="#11111b" data-density="900"
   data-speed="1.1" data-primary="0.05" data-trail="4" data-seed="7">. */
(function () {
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initWave(cv) {
    if (cv.__waveOn) return;
    if (!window.createEngine) { setTimeout(function () { initWave(cv); }, 120); return; }
    cv.__waveOn = true;
    var d = cv.dataset;
    var cfg = {
      speed: +d.speed || 1.1, waveScale: +d.scale || 1, swirl: +d.swirl || 1.9,
      density: +d.density || 900, trailLength: +d.trail || 4,
      primaryWaves: +d.primary || 0.05, lifeMin: 10, lifeMax: 20,
      primaryColor: d.accent || '#fab387', bgColor: d.bg || '#11111b'
    };
    cv.__cfg = cfg;
    var w = Math.max(4, cv.clientWidth | 0), h = Math.max(4, cv.clientHeight | 0);
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d', { alpha: false });
    var eng = createEngine(+d.seed || ((Math.random() * 99999) | 0) + 1, w, h, cfg);
    cv.__eng = eng;
    var last = 0, frames = 0;
    function tick(now) {
      cv.__raf = requestAnimationFrame(tick);
      if (document.hidden) { last = 0; return; }
      if (reduced && frames > 240) { cancelAnimationFrame(cv.__raf); return; } // settle, then freeze
      if (last && now - last < 1000 / 48 - 1) return;
      var dt = last ? Math.min(0.05, Math.max(0.001, (now - last) / 1000)) : 1 / 60;
      last = now; frames++;
      eng.setConfig(cv.__cfg);
      eng.frame(ctx, dt);
    }
    cv.__raf = requestAnimationFrame(tick);
    try {
      new ResizeObserver(function () {
        var nw = Math.max(4, cv.clientWidth | 0), nh = Math.max(4, cv.clientHeight | 0);
        if ((nw === w && nh === h) || nw < 4) return;
        w = nw; h = nh; cv.width = w; cv.height = h; eng.resize(w, h);
      }).observe(cv);
    } catch (e) {}
  }

  window.__initWaves = function (root) {
    (root || document).querySelectorAll('canvas[data-wave]').forEach(initWave);
  };
  // Recolor every wave live (accent follows user preference).
  window.__setWaveAccent = function (color) {
    document.querySelectorAll('canvas[data-wave]').forEach(function (cv) {
      if (cv.__cfg) cv.__cfg.primaryColor = color;
    });
  };

  var pend = false;
  function sweep() {
    pend = false;
    if (window.renderIcons) window.renderIcons();
    window.__initWaves();
  }
  var mo = new MutationObserver(function () {
    if (!pend) { pend = true; requestAnimationFrame(sweep); }
  });
  function start() {
    mo.observe(document.documentElement, { childList: true, subtree: true });
    sweep();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
