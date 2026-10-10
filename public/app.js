(function () {
  var NAMES = { day: "today", week: "week", month: "month" };
  var COLORS = ["#7a5cc4", "#2f7fb8", "#c0603a", "#3c9a6e", "#b5476e", "#5a6fd1", "#a3842a", "#3a8c9a"];
  var B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  var $ = function (id) { return document.getElementById(id); };

  function pct(v) { return (v >= 0 ? "+" : "") + v.toFixed(1) + "%"; }
  function pts(v) { return (v >= 0 ? "+" : "") + v.toFixed(1) + " pts"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function short(a) { return a.slice(0, 4) + "…" + a.slice(-4); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function note(text, isError) { var n = $("joinnote"); n.textContent = text; n.style.color = isError ? "var(--down)" : ""; n.hidden = false; }

  // ---------- leaderboard ----------
  function render(p) {
    document.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-selected", t.dataset.p === p ? "true" : "false"); });
    $("pname").textContent = NAMES[p];
    $("rows").classList.add("busy");
    fetch("/api/leaderboard?period=" + p).then(function (r) { return r.json(); }).then(function (d) {
      $("pspy").textContent = d.spy == null ? "updating" : (d.spy >= 0 ? "+" : "") + d.spy.toFixed(2) + "%";
      var html = "", crossed = false;
      (d.rows || []).forEach(function (t, i) {
        if (!crossed && t.vs < 0) { crossed = true; html += '<tr class="divider"><td colspan="6">Behind the index</td></tr>'; }
        var av = t.avatar ? '<span class="av"><img src="' + esc(t.avatar) + '" alt=""></span>'
          : t.handle ? '<span class="av" style="background:' + COLORS[i % COLORS.length] + '">' + esc(t.handle[0].toUpperCase()) + "</span>"
          : '<span class="av anon">?</span>';
        var name = t.handle ? '<a class="handle" href="https://x.com/' + esc(t.handle) + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">@' + esc(t.handle) + "</a>"
          : '<span class="addr">' + short(t.wallet) + "</span>";
        html += '<tr class="' + (i < 3 ? "top" : "") + '"><td class="rank">' + (i + 1) + '</td><td><span class="who">' + av + name + "</span></td>" +
          '<td class="' + (t.ret >= 0 ? "pos" : "neg") + '">' + pct(t.ret) + "</td>" +
          '<td><span class="pill ' + (t.vs >= 0 ? "pos" : "neg") + '">' + pts(t.vs) + "</span></td>" +
          "<td>" + t.trades + "</td><td>$" + Math.round(t.volume).toLocaleString("en-US") + "</td></tr>";
      });
      if (!html) html = '<tr class="empty"><td colspan="6">Nobody has qualified for this period yet. Traders need 30 trades and $1,000 of volume in the period. Join below to be the first.</td></tr>';
      $("rows").innerHTML = html;
    }).catch(function () {
      $("rows").innerHTML = '<tr class="empty"><td colspan="6">The board didn\'t load. Refresh the page to try again.</td></tr>';
    }).then(function () { $("rows").classList.remove("busy"); });
  }
  document.querySelectorAll(".tab").forEach(function (t) { t.addEventListener("click", function () { render(t.dataset.p); }); });

  // ---------- report card ----------
  $("form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var a = $("addr").value.trim(), err = $("err"), btn = ev.submitter || $("form").querySelector("button");
    if (!B58.test(a)) { err.textContent = "That doesn't look like a Solana address. Paste the full address, 32 to 44 letters and numbers."; err.hidden = false; return; }
    err.hidden = true; btn.disabled = true; btn.textContent = "Checking…";
    fetch("/api/report?wallet=" + a).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
      .then(function (d) {
        var m = d.scores.month, vs = m.vs;
        $("resultbox").hidden = false;
        $("cv").textContent = m.trades === 0 ? "No trades in the last 30 days" : vs >= 0 ? "You beat the index" : "The index beat you";
        $("cv").className = "verdict " + (m.trades === 0 ? "" : vs >= 0 ? "win" : "lose");
        $("cr").textContent = pct(m.ret); $("cr").className = m.ret >= 0 ? "win" : "lose";
        $("cs").textContent = pct(d.spy.month);
        $("cd").textContent = pts(vs); $("cd").className = vs >= 0 ? "win" : "lose";
        $("crank").textContent = !m.qualified ? m.trades + " trades, $" + Math.round(m.volume).toLocaleString("en-US") + " volume. Needs 30 trades and $1,000 to rank."
          : (d.joined ? "Rank #" : "Would rank #") + d.rank + " this month";
        var text = vs >= 0 ? "My trades beat the S&P 500 by " + vs.toFixed(1) + " points this month. Did yours? $BEAT"
          : "The S&P 500 beat my trades by " + (-vs).toFixed(1) + " points this month. Should have bought the index. $BEAT";
        $("share").href = "https://x.com/intent/tweet?text=" + encodeURIComponent(text + " " + location.origin + "/leaderboard");
      })
      .catch(function (e) { err.textContent = e.message || "Something went wrong. Try again."; err.hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = "Check wallet"; });
  });

  // ---------- join with wallet ----------
  function provider() { return (window.phantom && window.phantom.solana) || window.solflare || window.solana || null; }
  $("joinbtn").addEventListener("click", async function () {
    var w = provider();
    if (!w) { note("No Solana wallet found. Install Phantom or Solflare, or open this page in your wallet app's browser.", true); return; }
    try {
      var c = await w.connect();
      var wallet = (c && c.publicKey ? c.publicKey : w.publicKey).toString();
      var time = new Date().toISOString();
      var msg = "Join the Beat The Index leaderboard\nWallet: " + wallet + "\nTime: " + time;
      note("Check your wallet and sign the message. It's free and moves no funds.");
      var signed = await w.signMessage(new TextEncoder().encode(msg), "utf8");
      var sig = signed.signature || signed;
      var b64 = btoa(String.fromCharCode.apply(null, Array.from(sig)));
      note("Calculating your first score. This can take up to a minute…");
      var r = await fetch("/api/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: wallet, time: time, signature: b64 }) });
      var j = await r.json();
      if (!r.ok) throw new Error(j.error);
      store("beat_token", j.token);
      store("beat_wallet", wallet);
      $("joinbtn").textContent = "Joined as " + short(wallet);
      $("xbtn").hidden = false;
      note("You're on the board. Link X if you want your handle shown instead of your address.");
      render(document.querySelector('.tab[aria-selected="true"]').dataset.p);
    } catch (e) {
      note(e && e.message && !/reject|cancel/i.test(e.message) ? e.message : "Joining was cancelled.", true);
    }
  });
  $("xbtn").addEventListener("click", function () {
    var t = store("beat_token");
    if (!t) { note("Join with your wallet first.", true); return; }
    location.href = "/api/x/start?token=" + encodeURIComponent(t);
  });

  // ---------- returning from X ----------
  var q = new URLSearchParams(location.search);
  var known = store("beat_wallet");
  if (known) { $("joinbtn").textContent = "Joined as " + short(known); $("xbtn").hidden = false; }
  if (q.get("linked")) { note("Linked @" + q.get("linked") + ". Your handle shows on the board from the next update."); $("xbtn").hidden = true; }
  var xe = q.get("xerror");
  if (xe) note({ taken: "That X account is already linked to another wallet.", expired: "The X login took too long. Try Link X again.", cancelled: "X linking was cancelled.", failed: "X didn't accept the login. Try again in a minute." }[xe] || "X linking failed.", true);
  if (q.toString()) history.replaceState(null, "", location.pathname);

  render("week");
})();
