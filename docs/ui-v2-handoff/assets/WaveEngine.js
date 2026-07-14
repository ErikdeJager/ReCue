// WaveEngine.js — the Monarch wave background simulation (ARCHITECTURE.md
// §Theme → wave background). A faithful port of the design handoff's canvas
// reference: thousands of strands advected through a seeded, domain-warped
// fBm flow field, drawing fading trails. Same seed + same settings + same
// canvas size ⇒ the same wave pattern, so the RNG CALL ORDER below matches
// the reference exactly (including draws for constants the simulation no
// longer uses) — do not "clean up" an unused rng() call.
//
// Factory, not a stateful library: each canvas (one per monitor, plus the
// lock surface) owns an isolated engine via createEngine().

// Appearance quantization ladders (the design's tuned alpha rungs).
var GOLD_A = [0.12, 0.18, 0.25, 0.33, 0.42];
var BLUE_A = [0.03, 0.06, 0.10, 0.16, 0.24];

// Density is tuned for a 2560x1440 canvas; other sizes scale the strand
// count with area so the look stays identical on any device.
var REF_AREA = 2560 * 1440;

function createEngine(seed, width, height, cfg) {
    var W = width, H = height;

    // cfg fields (updated per-frame via setConfig): speed, waveScale, swirl,
    // density, trailLength, primaryWaves, lifeMin, lifeMax, fadeCap unused;
    // primaryColor "#rrggbb", bgColor "#rrggbb".
    var C = cfg;

    var rng;            // mulberry32, seeded once per pattern
    var perm;           // shuffled 256-entry permutation table (value noise)
    var baseDir = 0;    // the field's overall direction (per-seed)
    var fieldT = 0;     // field morph time
    var styleSL = [];   // 10 per-seed {s,l,bright} strand style draws. Hue is
                        // NOT stored: every strand is painted in the accent's
                        // hue, resolved per frame (§Theme — the wave is a
                        // monochrome accent family; dim strands desaturated,
                        // the 2 bright ones at the accent's own saturation).
    var particles = [];
    var spawnAcc = 0;
    var pPrim = 0;      // golden spawn probability (primaryWaves * 0.12)
    var needBg = true;  // paint an opaque background on the next frame
    var sweepAcc = 0;   // simulation seconds since the last residue sweep
    var sweepOps;       // undefined = not yet detected; null = unsupported;
                        // else {diff, lighten} or {diff, darken} op names

    // ---------- seeded randomness ----------
    function mulberry(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // 2D value noise over the shuffled permutation table, smoothstep-blended.
    function vn(x, y) {
        var ix = Math.floor(x), iy = Math.floor(y);
        var fx = x - ix, fy = y - iy;
        var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        var a = perm[(perm[ix & 255] + iy) & 255] / 255;
        var b = perm[(perm[(ix + 1) & 255] + iy) & 255] / 255;
        var c = perm[(perm[ix & 255] + iy + 1) & 255] / 255;
        var d = perm[(perm[(ix + 1) & 255] + iy + 1) & 255] / 255;
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }

    function fbm(x, y) {
        return vn(x, y) * 0.62
            + vn(x * 2.03 + 37.2, y * 2.03 + 11.9) * 0.26
            + vn(x * 4.07 + 17.1, y * 4.07 + 289.4) * 0.12;
    }

    function fbm2(x, y) {
        return vn(x, y) * 0.7 + vn(x * 2.03 + 37.2, y * 2.03 + 11.9) * 0.3;
    }

    function snap(v, arr) {
        var bi = 0, bd = 1e9;
        for (var i = 0; i < arr.length; i++) {
            var d = Math.abs(arr[i] - v);
            if (d < bd) { bd = d; bi = i; }
        }
        return bi;
    }

    // ---------- colors ----------
    // HSL → "rgb(r,g,b)" done here (once per seed) rather than trusting the
    // canvas color parser with hsl() strings.
    function hslStr(h, s, l) {
        h = (h % 360) / 360; s /= 100; l /= 100;
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        function hue(t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }
        var r = Math.round(hue(h + 1 / 3) * 255);
        var g = Math.round(hue(h) * 255);
        var b = Math.round(hue(h - 1 / 3) * 255);
        return "rgb(" + r + "," + g + "," + b + ")";
    }

    function hexRgb(hex) {
        var h = String(hex).replace("#", "");
        var n = parseInt(h, 16);
        if (isNaN(n)) return { r: 17, g: 17, b: 27 }; // crust
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbHs(c) { // {r,g,b} → {h (degrees), s (percent)}; grays → h 0, s 0
        var mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
        if (mx === mn) return { h: 0, s: 0 };
        var d = mx - mn, h;
        if (mx === c.r) h = ((c.g - c.b) / d + 6) % 6;
        else if (mx === c.g) h = (c.b - c.r) / d + 2;
        else h = (c.r - c.g) / d + 4;
        var l2 = mx + mn; // 2·lightness·255
        return { h: h * 60, s: 100 * d / (l2 > 255 ? 510 - l2 : l2) };
    }

    // ---------- pattern setup ----------
    function reseed(newSeed) {
        // Hash the raw seed exactly as the reference does; 0 is illegal state.
        rng = mulberry((((newSeed * 2654435761) ^ 0x9E3779B9) >>> 0) || 1);
        var R = rng;
        perm = [];
        for (var i = 0; i < 256; i++) perm[i] = i;
        for (var j = 255; j > 0; j--) {
            var k = (R() * (j + 1)) | 0;
            var t = perm[j]; perm[j] = perm[k]; perm[k] = t;
        }
        baseDir = R() * Math.PI * 2;
        R(); R(); R();       // gustOff/phase1/phase2 — legacy draws kept for seed parity
        fieldT = R() * 40;
        styleSL = [];
        for (var s = 0; s < 10; s++) {
            var bright = s >= 8;
            var L = bright ? 74 + R() * 18 : 26 + s * 3 + R() * 8;
            var S = 16 + R() * 26;
            var Hh = 225 + R() * 14;
            void Hh; // the handoff's blue-hue draw — kept for seed parity,
                     // but every strand now takes the accent's hue at paint
                     // time (frame() builds the styles from these S/L draws)
            styleSL.push({ s: S | 0, l: L | 0, bright: bright });
        }
        particles.length = 0;
        spawnAcc = 0;
        sweepAcc = 0;
        needBg = true;
    }

    // The residue sweep needs blend modes, and the hosts differ: browsers
    // ship the CSS names, Qt the "qt-" vendor names — and Qt's "qt-lighten"
    // is BROKEN (assigning it lands on "lighter", additive plus, measured on
    // Qt 6 raster — it would brighten the screen every sweep), so on Qt
    // max(dst,bg) is built from qt-difference + qt-darken instead. Only an
    // assignment that reads back exactly is trusted; unsupported values are
    // ignored per spec (some hosts throw — treat both as "no").
    function tryOp(ctx, name) {
        try { ctx.globalCompositeOperation = name; } catch (e) { }
        var ok = ctx.globalCompositeOperation === name;
        ctx.globalCompositeOperation = "source-over";
        return ok;
    }

    function detectSweepOps(ctx) {
        if (tryOp(ctx, "difference") && tryOp(ctx, "lighten"))
            return { diff: "difference", lighten: "lighten" };
        if (tryOp(ctx, "qt-difference") && tryOp(ctx, "qt-darken"))
            return { diff: "qt-difference", darken: "qt-darken" };
        return null;
    }

    // ---------- strands ----------
    function targetCount() {
        var d = Math.min(6000, Math.max(400, Number(C.density) || 1200));
        var scaled = d * (W * H) / REF_AREA;
        return Math.round(Math.min(8000, Math.max(100, scaled)));
    }

    function spawn() {
        var R = rng, M = 120;
        var prim = R() < pPrim;
        var x = -M + R() * (W + 2 * M), y = -M + R() * (H + 2 * M);
        var lifeMin = Math.max(0.5, Number(C.lifeMin) || 10);
        var lifeMax = Math.max(lifeMin, Number(C.lifeMax) || 20);
        var p = {
            x: x, y: y, ox: x, oy: y, prim: prim,
            life: lifeMin + R() * (lifeMax - lifeMin),
            spd: 0.5 + Math.pow(R(), 1.4) * 1.0
        };
        // Patch noise: some REGIONS of the field are dimmer than others.
        var lp = 0.0016 / Math.max(0.1, Number(C.waveScale) || 1);
        var patch = vn(x * lp + 31.7, y * lp - 12.3);
        if (prim) {
            var wi = R() < 0.5 ? 0 : 1;
            p.w = wi ? 1.2 : 0.8;
            var ai = snap((0.30 + R() * 0.30) * (0.75 + 0.35 * patch) * 0.65, GOLD_A);
            p.a = GOLD_A[ai];
            p.si = -1;
            p.bk = 1000 + wi * 10 + ai;
        } else {
            var si = (R() * 10) | 0;
            var bright = si >= 8;
            var base = bright ? 0.28 + R() * 0.30 : 0.10 + Math.pow(R(), 2.2) * 0.25;
            var bai = snap(base * (0.55 + 0.95 * Math.pow(patch, 1.6)) * 0.65, BLUE_A);
            p.a = BLUE_A[bai];
            var wr = R();
            var bwi = wr < 0.55 ? 0 : (wr < 0.85 ? 1 : 2);
            p.w = bwi === 0 ? 0.6 : (bwi === 1 ? 0.9 : 1.3);
            p.si = si;
            p.bk = si * 100 + bwi * 10 + bai;
        }
        return p;
    }

    function resize(nw, nh) {
        if (nw < 2 || nh < 2) return;
        W = nw; H = nh;
        // Keep strands; pull any now far out of bounds back on screen. The
        // canvas buffer resets on resize, so trails restart from a clean
        // background (needBg) — per the spec's resize behavior.
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            if (p.x > W + 140) { p.x = Math.random() * W; p.ox = p.x; }
            if (p.y > H + 140) { p.y = Math.random() * H; p.oy = p.y; }
        }
        needBg = true;
    }

    function setConfig(c) { C = c; }

    // ---------- per-frame simulate + draw ----------
    function frame(ctx, dt) {
        if (W < 4 || H < 4) return;
        var bg = hexRgb(C.bgColor);

        if (needBg) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = "rgb(" + bg.r + "," + bg.g + "," + bg.b + ")";
            ctx.fillRect(0, 0, W, H);
            needBg = false;
        }

        var speed = Math.max(0, Number(C.speed) || 0);
        if (speed <= 0.001) return; // freeze frame (paused handled by the tick timer)

        var waveScale = Math.max(0.1, Number(C.waveScale) || 1);
        var swirl = Number(C.swirl) || 1.9;
        var trail = Math.max(0.1, Number(C.trailLength) || 4);
        var amount = Math.min(1, Math.max(0, Number(C.primaryWaves) || 0));
        var pc = hexRgb(C.primaryColor);
        var primStyle = "rgb(" + pc.r + "," + pc.g + "," + pc.b + ")";
        // Strand styles, rebuilt per frame from the accent so a theme switch
        // re-colors the whole wave live (§Theme — monochrome accent family).
        // Dim strands: accent hue, per-seed S nudged up (+15, cap 60) so the
        // family still reads as a COLOR at trail alphas instead of gray;
        // bright pair: the accent's own saturation — legible at low alpha.
        var acc = rgbHs(pc), accH = acc.h | 0;
        var frameStyles = [];
        for (var sj = 0; sj < styleSL.length; sj++) {
            var st = styleSL[sj];
            frameStyles.push(st.bright
                ? hslStr(accH, acc.s | 0, st.l)
                : hslStr(accH, Math.min(60, st.s + 15), st.l));
        }

        fieldT += dt * (0.20 + 0.30 * Math.min(speed, 2.5));
        var T = fieldT;

        // steady share of golden strands — no gusts or flares
        pPrim = amount * 0.12;

        // gradual spawning from empty — steady-state replacement rate
        var target = targetCount();
        var P = particles;
        if (P.length < target) {
            var lifeMin = Math.max(0.5, Number(C.lifeMin) || 10);
            var lifeMax = Math.max(lifeMin, Number(C.lifeMax) || 20);
            spawnAcc += dt * (2 + target * 2 / (lifeMin + lifeMax));
            while (P.length < target && spawnAcc >= 1) { P.push(spawn()); spawnAcc -= 1; }
            if (spawnAcc > 4) spawnAcc = 4;
        }
        if (P.length > target) P.length = target;

        // fade pass (trail persistence) — framerate-independent
        var baseFade = Math.min(0.18, Math.max(0.005, 0.028 / trail));
        var fadeAlpha = 1 - Math.pow(1 - baseFade, dt * 60);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(" + bg.r + "," + bg.g + "," + bg.b + "," + fadeAlpha.toFixed(4) + ")";
        ctx.fillRect(0, 0, W, H);

        // Residue sweep. The alpha fade above can never FINISH on an 8-bit
        // canvas — its fill alpha quantizes to 1–2/255 and the blend's
        // rounding takes over: Qt rounds to nearest, so once a pixel is
        // within ~⌈0.5·255/alpha₈⌉ levels of bg it freezes — stale trails
        // pile up and slowly fill the screen. (Skia floors instead, sinking
        // everything toward black ~1 level/frame — the reference HTML
        // self-cleans and never shows the bug, which is why the handoff has
        // no full-decay path; this sweep is a deliberate deviation.) Once a
        // second: subtract one level from every channel (difference vs
        // rgb(1,1,1)), then clamp back up to bg (lighten where it exists,
        // else Qt's difference+darken construction below). An exact linear
        // decay — 1 level/s keeps the faint fur texture alive for seconds
        // (the wave look) while guaranteeing every stale line reaches bg
        // (worst stall ~127 levels ⇒ gone in ~2 min), and the clamp pins
        // the background at exactly bg on floor-rounding backends too.
        sweepAcc += dt;
        if (sweepAcc >= 1.0) {
            sweepAcc -= 1.0;   // carry the overshoot: exactly 1 sweep/s at any fps (dt ≤ 0.05 keeps the residual small — no bursts)
            if (sweepOps === undefined) sweepOps = detectSweepOps(ctx);
            if (sweepOps) {
                ctx.globalCompositeOperation = sweepOps.diff;
                ctx.fillStyle = "rgb(1,1,1)";
                ctx.fillRect(0, 0, W, H);
                if (sweepOps.lighten) {
                    ctx.globalCompositeOperation = sweepOps.lighten;
                    ctx.fillStyle = "rgb(" + bg.r + "," + bg.g + "," + bg.b + ")";
                    ctx.fillRect(0, 0, W, H);
                } else {
                    // max(dst,bg) without lighten: invert (difference vs
                    // white), min against the inverted bg (darken), invert
                    // back — measured pixel-exact on Qt's raster canvas.
                    ctx.globalCompositeOperation = sweepOps.diff;
                    ctx.fillStyle = "rgb(255,255,255)";
                    ctx.fillRect(0, 0, W, H);
                    ctx.globalCompositeOperation = sweepOps.darken;
                    ctx.fillStyle = "rgb(" + (255 - bg.r) + "," + (255 - bg.g) + "," + (255 - bg.b) + ")";
                    ctx.fillRect(0, 0, W, H);
                    ctx.globalCompositeOperation = sweepOps.diff;
                    ctx.fillStyle = "rgb(255,255,255)";
                    ctx.fillRect(0, 0, W, H);
                }
                ctx.globalCompositeOperation = "source-over";
            }
        }

        var f = 0.00085 / waveScale;
        var vpx = 40 * speed * dt;
        var m = 140;

        // Buckets: (color x width x alpha) → one stroke each (~50/frame).
        var buckets = {};
        for (var i = 0; i < P.length; i++) {
            var p = P[i];
            var wx = p.x * f, wy = p.y * f;
            var q = fbm2(wx + 5.2, wy + 1.3) - 0.5;                 // domain warp
            var n = fbm(wx + 0.9 * q + T * 0.03, wy + 0.9 * q - T * 0.02);
            var ang = baseDir + (n - 0.5) * 2.6 * swirl;
            var d = vpx * p.spd;
            var nx = p.x + Math.cos(ang) * d;
            var ny = p.y + Math.sin(ang) * d;
            var b = buckets[p.bk];
            if (b === undefined) {
                b = { style: p.prim ? primStyle : frameStyles[p.si],
                      w: p.w, a: p.a, segs: [] };
                buckets[p.bk] = b;
            }
            // One frame of lag: draw from the PREVIOUS frame's start point so
            // consecutive segments overlap — continuous lines, never beads.
            b.segs.push(p.ox, p.oy, nx, ny);
            p.ox = p.x; p.oy = p.y;
            p.x = nx; p.y = ny; p.life -= dt;
            if (p.life <= 0 || nx < -m || nx > W + m || ny < -m || ny > H + m) P[i] = spawn();
        }

        ctx.lineCap = "butt";
        ctx.lineJoin = "round";
        for (var key in buckets) {
            var bk = buckets[key];
            ctx.globalAlpha = bk.a;
            ctx.strokeStyle = bk.style;
            ctx.lineWidth = bk.w;
            ctx.beginPath();
            var s = bk.segs;
            for (var si = 0; si < s.length; si += 4) {
                ctx.moveTo(s[si], s[si + 1]);
                ctx.lineTo(s[si + 2], s[si + 3]);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    reseed(seed);

    return {
        frame: frame,
        resize: resize,
        reseed: reseed,
        setConfig: setConfig
    };
}
