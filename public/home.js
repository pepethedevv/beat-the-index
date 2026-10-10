(function () {
  var $ = function (id) { return document.getElementById(id); };

  // ---------- NYSE clock (real time, holidays ignored) ----------
  function nyParts(d) {
    var f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    var p = {}; f.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { dow: days[p.weekday], h: +p.hour % 24, m: +p.minute, s: +p.second };
  }
  function fmt(sec) { var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return (h ? h + "h " : "") + m + "m"; }
  function clock() {
    var t = nyParts(new Date());
    var nowS = t.h * 3600 + t.m * 60 + t.s, openS = 9.5 * 3600, closeS = 16 * 3600;
    var weekday = t.dow >= 1 && t.dow <= 5;
    var open = weekday && nowS >= openS && nowS < closeS;
    $("hero").classList.toggle("open", open);
    $("mkt").textContent = open ? "NYSE open" : "NYSE closed";
    var wait;
    if (open) wait = closeS - nowS;
    else {
      var add = 0, d = t.dow;
      if (!(weekday && nowS < openS)) { do { add++; d = (d + 1) % 7; } while (d === 0 || d === 6); }
      wait = add * 86400 + openS - nowS;
    }
    $("cd").textContent = (open ? "closes in " : "opens in ") + fmt(wait);
    $("nyt").textContent = "New York " + String(t.h).padStart(2, "0") + ":" + String(t.m).padStart(2, "0");
  }
  clock(); setInterval(clock, 15000);

  // ---------- race chart ----------
  function sign(v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }
  function setNum(id, v) { var e = $(id); e.textContent = sign(v); e.className = v >= 0 ? "pos" : "neg"; }

  function draw(bell, spy) {
    var N = bell.length;
    var all = bell.concat(spy, [0]);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
    var W = 640, H = 190, L = 38, R = 8, T = 8, B = 18;
    function x(i) { return L + i * (W - L - R) / (N - 1); }
    function y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
    function line(arr, color, w) {
      return '<polyline fill="none" stroke="' + color + '" stroke-width="' + w + '" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="' +
        arr.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ") + '"/>';
    }
    var s = "", range = hi - lo;
    var step = range > 40 ? 10 : range > 16 ? 5 : range > 6 ? 2 : 1;
    for (var g = Math.ceil(lo / step) * step; g <= hi; g += step) {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"' + (g === 0 ? "" : ' stroke-dasharray="3 4"') + "/>";
      s += '<text x="' + (L - 6) + '" y="' + (y(g) + 3) + '" text-anchor="end">' + (g > 0 ? "+" : "") + g + "%</text>";
    }
    s += '<text x="' + L + '" y="' + (H - 4) + '">' + (N < 90 ? "launch" : "24h ago") + '</text><text x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end">now</text>';
    s += line(spy, "var(--spy)", 2) + line(bell, "var(--brass)", 2.5);
    s += '<circle cx="' + x(N - 1) + '" cy="' + y(bell[N - 1]) + '" r="4" fill="var(--brass)"/>';
    $("chart").innerHTML = s;

    var b = bell[N - 1], sp = spy[N - 1], gap = b - sp;
    var own = ((1 + b / 100) / (1 + sp / 100) - 1) * 100;
    $("verdict").textContent = gap >= 0 ? "Yes, by " + gap.toFixed(2) + " points" : "No, behind by " + (-gap).toFixed(2) + " points";
    $("verdict").className = "verdict " + (gap >= 0 ? "win" : "lose");
    $("lb").textContent = sign(b); $("ls").textContent = sign(sp);
    setNum("d-spy", sp); setNum("d-own", own); setNum("d-tot", b);
  }

  // ---------- simulated prices (until BEAT_MINT is set) ----------
  var sim = null;
  function simulate() {
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }
    var spy = [0], own = [0];
    for (var i = 1; i < 60; i++) { spy.push(spy[i - 1] + rnd() * 0.12 + 0.01); own.push(own[i - 1] + rnd() * 1.1 + 0.05); }
    var pot = 412.38;
    function frame() {
      var bell = spy.map(function (s, i) { return ((1 + s / 100) * (1 + own[i] / 100) - 1) * 100; });
      draw(bell, spy);
      $("pot").textContent = pot.toFixed(3) + " SPYx";
    }
    frame();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sim = setInterval(function () {
        spy.shift(); own.shift();
        spy.push(spy[spy.length - 1] + rnd() * 0.12);
        own.push(own[own.length - 1] + rnd() * 1.1);
        pot += Math.abs(rnd()) * 0.08;
        frame();
      }, 2500);
    }
  }

  // After launch, before enough trading history: no fake numbers
  function waiting() {
    $("verdict").textContent = "The race starts soon";
    $("verdict").className = "verdict";
    ["lb", "ls"].forEach(function (id) { $(id).textContent = "--"; });
    ["d-spy", "d-own", "d-tot"].forEach(function (id) { $(id).textContent = "--"; $(id).className = ""; });
    $("chart").innerHTML = '<text x="320" y="95" text-anchor="middle" style="font-size:13px">The live chart appears after the first hour of trading.</text>';
  }

  // ---------- contract address ----------
  function showCA(mint) {
    if (!mint || !$("ca").hidden) return;
    $("caval").textContent = mint;
    $("cabuy").href = "https://pump.fun/coin/" + mint;
    $("cachart").href = "https://dexscreener.com/solana/" + mint;
    $("ca").hidden = false;
  }
  $("cacopy").addEventListener("click", function () {
    var btn = this, text = $("caval").textContent;
    function done() { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); }
    function fallback() { var r = document.createRange(); r.selectNodeContents($("caval")); var s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "Selected, press Ctrl+C"; }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  });

  // ---------- live prices ----------
  function load() {
    fetch("/api/race").then(function (r) { return r.json(); }).then(function (d) {
      showCA(d.mint);
      if (!d.mint) { if (!sim) simulate(); return; }   // before launch: sample chart with label
      if (sim) { clearInterval(sim); sim = null; }
      $("sim").hidden = true;
      if (d.live) draw(d.beat, d.spy); else waiting();
      if (d.pot) {
        $("pot").textContent = d.pot.spyx.toFixed(3) + " SPYx";
        $("potlink").href = "https://solscan.io/account/" + d.pot.wallet;
        $("potlink").hidden = false;
      } else {
        $("pot").textContent = "Coming soon";
      }
    }).catch(function () { if (!sim) simulate(); });
  }
  load();
  setInterval(load, 60000);
})();
