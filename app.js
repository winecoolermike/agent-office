/* GROK BOT / CHIEF: mission-control view of the agent board. Renders data.json (scrubbed). No libraries.
   Honesty rule: every number comes from data.json; missing values render as "not recorded". */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const RM = window.matchMedia("(prefers-reduced-motion: reduce)");
  const TZ = "America/Los_Angeles";

  /* ---------------- tiny safe markdown ---------------- */
  function inline(s) {
    let t = esc(s);
    const keep = [];
    const hold = h => "\u0000" + (keep.push(h) - 1) + "\u0000";
    t = t.replace(/`([^`]+)`/g, (_, c) => hold("<code>" + c + "</code>"));
    t = t.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (_, txt, u) => hold(`<a href="${u}" target="_blank" rel="noopener nofollow">${txt}</a>`));
    t = t.replace(/(^|[\s(;,])(https:\/\/[^\s<]+)/g, (m, pre, u) => {
      let tail = ""; while (/[.,;:)\]]$/.test(u)) { tail = u.slice(-1) + tail; u = u.slice(0, -1); }
      let label = u.replace(/^https:\/\/(www\.)?/, ""); if (label.length > 48) label = label.slice(0, 45) + "…";
      return pre + hold(`<a href="${u}" target="_blank" rel="noopener nofollow">${label}</a>`) + tail;
    });
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
  }
  function md(src) {
    if (!src) return "";
    const L = String(src).replace(/\r/g, "").split("\n"); let out = [], i = 0, list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    while (i < L.length) {
      const ln = L[i];
      if (/^\s*\|/.test(ln)) {
        close(); const rows = [];
        while (i < L.length && /^\s*\|/.test(L[i])) rows.push(L[i++]);
        const cells = r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        const body = rows.filter((r, k) => !(k === 1 && /^[\s|:\-]+$/.test(r)));
        const hdr = cells(body[0]);
        let h = `<div class="tw"><table class="${hdr.length > 3 ? "stack" : ""}"><thead><tr>${hdr.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`;
        for (const r of body.slice(1)) h += "<tr>" + cells(r).map((c, k) => `<td data-label="${esc((hdr[k] || "").replace(/\*/g, ""))}">${inline(c)}</td>`).join("") + "</tr>";
        out.push(h + "</tbody></table></div>"); continue;
      }
      let m;
      if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { close(); const n = Math.min(3, m[1].length + 1); out.push(`<h${n}>${inline(m[2])}</h${n}>`); }
      else if ((m = ln.match(/^(\s*)[-*]\s+(.*)$/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li${m[1].length ? ' style="margin-left:14px"' : ""}>${inline(m[2])}</li>`); }
      else if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
      else if (!ln.trim()) close();
      else { close(); out.push(`<p>${inline(ln)}</p>`); }
      i++;
    }
    close(); return out.join("");
  }
  let D = null;
  const SVGNS = "http://www.w3.org/2000/svg";
  const NR = '<span class="nr">not recorded</span>';
  const clip = (t, n) => { t = String(t ?? ""); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t; };
  const pretty = iso => { if (!iso) return "—"; const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };
  const ptTime = iso => { if (!iso) return null; const d = new Date(iso); if (isNaN(d)) return null; return d.toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT"; };
  const KEY = { "grok bot": "grok", "hal": "hal", "cash money": "cash", "compass": "compass", "sitescout": "scout", "5:30 check": "check" };
  const keyOf = name => KEY[String(name || "").toLowerCase()] || null;
  const STLABEL = { queued: "queued", pending: "pending", running: "running", needs_review: "review", approved: "approved", rejected: "rejected" };
  const KL = { plan: "plan", hal_review: "hal review", dispatch: "dispatch", compile: "compile", check: "5:30 check", brief: "6:30 brief", other: "log" };
  const tag = (st) => `<span class="tag s-${esc(st || "none")}">${esc(STLABEL[st] || st || "no status")}</span>`;
  const newestRun = () => (D.runs || [])[0] || null;
  const runFor = date => (D.runs || []).find(r => r.date === date) || null;

  /* sparkline from a REAL series; fewer than 2 points -> show the value only */
  function spark(vals) {
    const pts = vals.filter(v => v != null);
    if (pts.length < 2) return `<span class="sv">${pts.length ? esc(pts[0]) : "—"}</span>`;
    const lo = Math.min(...pts), hi = Math.max(...pts), W = 46, H = 14, n = pts.length;
    const xy = pts.map((v, i) => [(i / (n - 1)) * W, hi === lo ? H / 2 : H - ((v - lo) / (hi - lo)) * (H - 2) - 1]);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(pts.join(" → "))} across ${n} nights"><title>${esc(pts.join(" → "))} (one point per night)</title><polyline points="${xy.map(p => p.map(c => c.toFixed(1)).join(",")).join(" ")}"/><circle cx="${xy[n - 1][0].toFixed(1)}" cy="${xy[n - 1][1].toFixed(1)}" r="1.6"/></svg>`;
  }

  /* ---------------- top bar ---------------- */
  function renderBar() {
    const J = D.jobs || [], aw = (D.outbox || []).filter(o => o.awaiting_jeffrey).length;
    const r = runFor(D.night);
    $("b-night").innerHTML = `<em>night</em> ${esc(D.night ? pretty(D.night).toUpperCase() : "none on board")}${r && r.title ? ` <em>· ${esc((r.title.match(/\(for (.*)\)/) || [])[1] || "")}</em>` : ""}`;
    $("b-jobs").innerHTML = `<em>jobs</em> ${J.length}`;
    $("b-gate").innerHTML = `<em>gate</em> <span class="${aw ? "am" : ""}">${aw} awaiting jeffrey</span>`;
    $("b-built").innerHTML = `<em>data built</em> ${esc(D.built_at || "—")} <em>· board changed</em> ${esc(D.board_newest_change || "—")}`;
    const b = $("banner");
    if (D.missing_night) { b.hidden = false; b.textContent = `Night of ${pretty(D.missing_night.date)}: no run log yet. Plan: not run yet · 5:30 check: not run yet · 6:30 brief: not run yet. Showing the newest night on the board.`; }
    else b.hidden = true;
  }
  function tickClock() {
    $("clock").textContent = new Date().toLocaleTimeString("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }) + " PT";
  }

  /* ---------------- left column ---------------- */
  function renderBrief() {
    const g = (D.goals || []).find(x => x.active) || (D.goals || [])[0];
    if (!g) { $("brief").innerHTML = `<div class="empty">No goal files on the board.</div>`; return; }
    const f = g.fields || {}, row = (k, v) => `<dt>${esc(k)}</dt><dd>${v == null || v === "" ? NR : inline(v)}</dd>`;
    $("brief").innerHTML = `<div class="clamp3" title="${esc(g.title)}"><b>${esc(g.title)}</b></div>
      <dl class="kvr" style="margin-top:5px">${row("goal", g.file.replace(/^goals\//, ""))}${row("status", g.active ? "active (BOARD.md)" : "not listed active")}${row("owner", f.Owner)}${row("workers", f.Workers)}${row("scope", f.Scope)}${row("output", f.Deliverables)}${row("approval", f.Approval)}</dl>
      ${f.Success ? `<details class="more"><summary>success criteria</summary><div class="sub">${inline(f.Success)}</div></details>` : ""}`;
  }
  function renderSources() {
    const g = (D.goals || [])[0] || {}, f = g.fields || {}, si = D.sources_index || {};
    const allJobs = (D.jobs || []).length + (D.older_jobs || []).length;
    $("sources").innerHTML = `<dl class="kvr">
      <dt>allowed</dt><dd>${f.Sources ? inline(f.Sources) : NR}</dd>
      <dt>board</dt><dd>BOARD.md · ${(D.goals || []).length} goal · ${allJobs} job files · ${(D.runs || []).length} run logs · ${(D.outbox || []).length} outbox</dd>
      <dt>cited</dt><dd>${si.total_links != null ? `<b>${si.total_links}</b> public links in ${si.source_entries} source entries (${si.unlinked_entries} without a link), night ${esc(pretty(si.night))}` : NR}</dd></dl>`;
  }
  function renderRules() {
    const c = D.caps || {};
    $("rules").innerHTML = `<dl class="kvr"><dt>calls</dt><dd>${c.calls != null ? `<b>${c.calls}</b> / bot / night` : NR}</dd><dt>spend</dt><dd>${c.usd != null ? `<b>$${c.usd}</b> cap` : NR}</dd><dt>at ${c.warn_pct ?? "?"}%</dt><dd>priority-1 jobs only</dd></dl>
      <div class="hr"></div><ul class="rl">${(D.rules || []).map(r => `<li class="clamp2" title="${esc(r.replace(/`/g, ""))}">${inline(r)}</li>`).join("") || `<li>${NR}</li>`}</ul><p class="sub">From BOARD.md, verbatim.</p>`;
  }
  function renderBudget() {
    const cap = D.caps.calls, warn = D.caps.warn_pct, H = D.history || [];
    let h = `<div class="brow dimk" style="font-size:10px"><span>bot</span><span>calls tonight</span><span class="v">/${cap ?? "?"}</span><span class="v">nights</span></div>`;
    for (const b of D.budget || []) {
      const k = keyOf(b.bot), pct = b.calls != null && cap ? Math.min(100, b.calls / cap * 100) : 0;
      const cls = b.calls != null && cap && b.calls > cap ? "o" : (warn && pct >= warn ? "w" : "");
      h += `<div class="brow" title="${esc(b.note || (b.jobs ? b.jobs + " job file(s) tonight" : "no job file tonight"))}"><span class="n">${esc(b.bot)}</span><span class="bar">${b.calls != null ? `<i class="${cls}" style="width:${pct}%"></i>` : ""}${warn ? `<u style="left:${warn}%"></u>` : ""}</span>
        <span class="v">${b.calls != null ? b.calls : '<span class="nr">n/r</span>'}</span>${spark(H.map(x => x.calls ? x.calls[k] : null))}</div>`;
    }
    const ts = D.team_spend;
    h += `<div class="hr"></div><dl class="kvr"><dt>$ team</dt><dd>${ts ? `<b class="ok">$${esc(ts.values.join(", $"))}</b> <span class="dimk">(${esc(ts.source)})</span>` : NR}</dd><dt>$ per bot</dt><dd>${(D.budget || []).some(b => b.usd != null) ? (D.budget || []).map(b => `${esc(b.bot)} ${b.usd != null ? "$" + b.usd : "n/r"}`).join(" · ") : NR + " <span class=\"dimk\">(no usd_spent in job files)</span>"}</dd></dl>
      <p class="sub">n/r = not recorded. Grok Bot and the 5:30 Check have no job files.${(D.budget || []).filter(b => b.note).map(b => " " + esc(b.bot) + ": " + esc(b.note) + ".").join("")} Sparklines: calls per night from job files.</p>`;
    $("budget").innerHTML = h;
  }
  function renderPrior() {
    const H = (D.history || []).slice();
    if (!H.length) { $("prior").innerHTML = `<div class="empty">No prior runs on the board.</div>`; return; }
    const ser = f => spark(H.map(f));
    $("prior").innerHTML = `<div class="brow" style="grid-template-columns:minmax(0,1fr) 46px 46px 46px;font-size:10px"><span class="dimk">per night →</span><span class="sv">jobs</span><span class="sv">calls</span><span class="sv">links</span></div>
      <div class="brow" style="grid-template-columns:minmax(0,1fr) 46px 46px 46px"><span class="dimk">${H.length} night${H.length > 1 ? "s" : ""}</span>${ser(x => x.jobs)}${ser(x => x.total_calls)}${ser(x => x.links)}</div>
      <table class="t"><thead><tr><th>night</th><th>jobs</th><th>✓/✗</th><th>calls</th><th>$</th></tr></thead><tbody>${H.slice().reverse().map(x =>
        `<tr title="${esc(x.run_file || "no run log")}"><td>${esc(pretty(x.date))}</td><td>${x.jobs}</td><td><span class="ok">${x.status.approved || 0}</span>/<span class="${x.status.rejected ? "bad" : ""}">${x.status.rejected || 0}</span></td><td>${x.total_calls ?? "n/r"}</td><td>${x.spend_values ? "$" + esc(x.spend_values.join(",")) : "n/r"}</td></tr>`).join("")}</tbody></table>
      <p class="sub">Links = public links in that night's job sources. $ = spend stated in that night's run log.</p>`;
  }

  /* ---------------- right column ---------------- */
  function renderPlanner() {
    const r = runFor(D.night) || newestRun();
    if (!r) { $("planner").innerHTML = `<div class="empty">Plan: not run yet.</div>`; return; }
    const plan = r.sections.find(s => s.kind === "plan"), rev = r.sections.find(s => s.kind === "hal_review");
    const first = s => (s.body.split("\n").find(l => l.trim()) || "").replace(/^[-*]\s*/, "");
    $("planner").innerHTML = `<dl class="kvr">
      <dt>plan</dt><dd>${plan ? `<span class="cy">${esc(plan.time || "—")}</span> ${esc(plan.heading.replace(/^\d{1,2}:\d{2}\s*[AP]M\s*/i, ""))}` : '<span class="nr">not run yet</span>'}</dd>
      <dt>review</dt><dd>${rev ? `<span class="cy">${esc(rev.time || "—")}</span> ${esc(clip(first(rev), 90))}` : '<span class="nr">not in log</span>'}</dd>
      <dt>dispatch</dt><dd>${(D.dispatch || []).map(d => `<span class="cy">${esc(d.time)}</span> ${esc(d.what)}`).join("<br>") || NR}</dd>
      <dt>planned</dt><dd>${(D.jobs || []).length} jobs · P1 ${(D.jobs || []).filter(j => j.priority === 1).length} · P2 ${(D.jobs || []).filter(j => j.priority === 2).length}</dd></dl>
      ${plan ? `<details class="more"><summary>plan notes (${esc(r.file)})</summary><div class="md sub">${md(plan.body)}</div></details>` : ""}
      <div class="hr"></div><div class="dimk" style="font-size:10px">schedule (BOARD.md)</div><ul class="rl">${(D.schedule || []).map(s => `<li class="clamp2">${inline(s)}</li>`).join("")}</ul>`;
  }
  function renderJobs() {
    const J = D.jobs || [], n = s => J.filter(j => j.status === s).length;
    const c = { q: n("queued") + n("pending"), r: n("running"), v: n("needs_review"), a: n("approved"), x: n("rejected") }, tot = J.length || 1;
    const O = D.older_jobs || [];
    $("jobs").innerHTML = `<div class="cnt"><div class="c-q"><b>${c.q}</b><span>queued</span></div><div class="c-r"><b>${c.r}</b><span>running</span></div><div class="c-v"><b>${c.v}</b><span>review</span></div><div class="c-a"><b>${c.a}</b><span>approved</span></div><div class="c-x"><b>${c.x}</b><span>rejected</span></div></div>
      <div class="stack" title="status mix tonight">${[["q", "#56697a"], ["r", "var(--cy)"], ["v", "var(--am)"], ["a", "var(--gr)"], ["x", "var(--rd)"]].map(([k, col]) => c[k] ? `<i style="width:${c[k] / tot * 100}%;background:${col}"></i>` : "").join("")}</div>
      <dl class="kvr"><dt>night</dt><dd>${esc(pretty(D.night))} · ${J.length} job files</dd><dt>earlier</dt><dd>${O.length} jobs · ${O.filter(j => j.status === "approved").length} approved · ${O.filter(j => j.status === "rejected").length} rejected</dd><dt>calls/job</dt><dd>${spark((D.history || []).map(h => h.jobs ? (h.total_calls != null ? Math.round(h.total_calls / h.jobs) : null) : null))}</dd></dl>`;
  }
  function renderSrcIdx() {
    const si = D.sources_index || {}, Ds = si.domains || [];
    if (!Ds.length) { $("srcidx").innerHTML = `<div class="empty">No linked sources in tonight's job files.</div>`; return; }
    const mx = Math.max(...Ds.map(d => d.links)), row = d => `<div class="dom" title="${esc(d.owners.join(", "))}"><span>${esc(d.domain)}</span><span class="bar"><i style="width:${d.links / mx * 100}%"></i></span><span class="v">${d.links}</span></div>`;
    $("srcidx").innerHTML = `<dl class="kvr"><dt>links</dt><dd><b>${si.total_links}</b> → ${Ds.length} domains</dd><dt>per job</dt><dd>${(si.per_job || []).map(p => `${esc(p.owner)} ${p.links}`).join(" · ")}</dd></dl><div class="hr"></div>
      ${Ds.slice(0, 9).map(row).join("")}${Ds.length > 9 ? `<details class="more"><summary>+${Ds.length - 9} more domains</summary>${Ds.slice(9).map(row).join("")}</details>` : ""}`;
  }

  /* ---------------- bottom strip ---------------- */
  let rlDate = null;
  function renderRunlog() {
    const R = D.runs || [];
    if (!rlDate || !runFor(rlDate)) rlDate = R.length ? R[0].date : null;
    $("rl-tabs").innerHTML = R.map(r => `<button class="btn ${r.date === rlDate ? "on" : ""}" type="button" data-rl="${esc(r.date)}">${esc(pretty(r.date))}</button>`).join("");
    const r = runFor(rlDate);
    if (!r) { $("runlog").innerHTML = `<div class="empty">No run logs yet. Plan: not run yet.</div>`; return; }
    const has = k => r.sections.some(s => s.kind === k);
    let h = `<div class="sub" style="margin:0 0 4px">${esc(r.file)} · changed ${esc(r.mtime || "—")}</div>`;
    h += r.sections.map((s, i) => `<details class="lg"${i === r.sections.length - 1 && r === R[0] ? "" : ""}><summary><span class="tm">${esc(s.time || "—")}</span><span class="k-${esc(s.kind)}">${esc(KL[s.kind] || "log")}</span><span class="hd">${esc(s.heading.replace(/^\d{1,2}:\d{2}\s*[AP]M\s*/i, ""))} <span class="dimk">· ${esc(clip((s.body.split("\n").find(l => l.trim()) || "").replace(/^[-*]\s*/, ""), 110))}</span></span></summary><div class="body md">${md(s.body)}</div></details>`).join("");
    if (!has("check")) h += `<div class="empty">5:30 check: not run yet.</div>`;
    if (!has("brief")) h += `<div class="empty">6:30 brief: not run yet.</div>`;
    $("runlog").innerHTML = h;
  }
  function renderDispatch() {
    const J = D.jobs || [], cap = D.caps.calls;
    if (!J.length) { $("dispatch").innerHTML = `<div class="empty">No jobs dispatched for this night.</div>`; return; }
    const si = Object.fromEntries(((D.sources_index || {}).per_job || []).map(p => [p.id, p.links]));
    $("dispatch").innerHTML = `<table class="t jb"><thead><tr><th>job</th><th>bot</th><th>p</th><th>status</th><th>calls</th><th>links</th></tr></thead><tbody>${J.map(j => `
      <tr><td title="${esc(j.file)}">${esc(j.id.replace(/^.*-(\d+)$/, "-$1"))}</td><td>${esc(j.owner)}</td><td>${esc(j.priority ?? "?")}</td><td>${tag(j.status)}</td>
      <td><span class="bar" style="display:inline-block;width:34px;vertical-align:middle"><i style="width:${j.calls_used != null && cap ? Math.min(100, j.calls_used / cap * 100) : 0}%"></i></span> ${j.calls_used ?? "n/r"}</td><td>${si[j.id] ?? 0}</td></tr>
      <tr><td colspan="6" class="tk"><div class="tsk" title="${esc(j.task)}">${esc(j.task)}</div>
      <details class="more"><summary>task, review${j.result ? ", result" : ""} · updated ${esc(ptTime(j.updated) || "n/r")}</summary><div class="sub">${inline(j.task || "")}</div>${j.result ? `<div class="sub"><b>result:</b> ${inline(j.result)}</div>` : ""}<div class="sub"><b>review:</b> ${j.review ? inline(j.review) : NR}</div>
      <div class="sub"><b>next:</b> ${j.next_step ? inline(j.next_step) : NR}</div></details></td></tr>`).join("")}</tbody></table>
      <p class="sub">Times from the run log: ${(D.dispatch || []).map(d => esc(d.time) + " " + esc(d.what)).join(" · ") || "not recorded"}.</p>`;
  }
  function renderGate() {
    const O = D.outbox || [], aw = O.map((o, i) => [o, i]).filter(([o]) => o.awaiting_jeffrey);
    const rev = (D.jobs || []).filter(j => j.status === "needs_review"), ts = D.team_spend;
    const r = runFor(D.night), brief = r && r.sections.find(s => s.kind === "brief");
    $("gate").innerHTML = `<div class="big">${ts ? "$" + esc(ts.values.join(", $")) : '<span class="nr" style="font-size:14px">$ not recorded</span>'}</div><div class="sub" style="margin:0 0 6px">spend tonight${ts ? " · " + esc(ts.source) : ""}</div>
      <div class="dimk" style="font-size:10px;margin-bottom:3px">AWAITING JEFFREY (${aw.length})</div>
      ${aw.length ? aw.map(([o, i]) => `<div class="gi"><b>${esc(o.title || o.file)}</b>${i === 0 ? ' <span class="tag s-needs_review">newest</span>' : ""}<div class="f">${esc(o.file)} · ${esc(o.mtime || "—")}</div><button class="btn amber" type="button" data-sheet="${i}" style="margin-top:4px">open sheet ▸</button></div>`).join("") : `<div class="empty">Nothing in the outbox is awaiting Jeffrey.</div>`}
      <div class="dimk" style="font-size:10px;margin:6px 0 3px">WITH THE 5:30 CHECKER (${rev.length})</div>
      ${rev.length ? rev.map(j => `<div>${esc(j.id)} · ${esc(j.owner)} ${tag(j.status)}</div>`).join("") : `<div class="sub" style="margin:0">None (0 jobs in needs_review).</div>`}
      <div class="dimk" style="font-size:10px;margin:6px 0 3px">6:30 BRIEF</div><div class="sub" style="margin:0">${brief ? `<span class="cy">${esc(brief.heading)}</span>` : '<span class="nr">not run yet</span>'}</div>`;
  }

  /* ---------------- This Week drawer ---------------- */
  let sheetIdx = 0;
  function tickerCards(mdText) {
    const L = (mdText || "").split("\n"), i = L.findIndex(l => /^\|\s*Ticker\s*\|/i.test(l)); if (i < 0) return "";
    const hdr = L[i].replace(/^\s*\||\|\s*$/g, "").split("|").map(c => c.trim().toLowerCase());
    const at = p => hdr.findIndex(h => h.startsWith(p)), bi = at("bias"), ci = at("mon close") >= 0 ? at("mon close") : hdr.findIndex(h => /close/.test(h));
    const si = at("support"), ri = at("resistance");
    const cards = [];
    for (let k = i + 2; k < L.length && /^\s*\|/.test(L[k]); k++) {
      const c = L[k].trim().replace(/^\||\|$/g, "").split("|").map(x => x.trim());
      const first = s => (s || "").split(/;|,(?![^(]*\))/)[0];
      cards.push(`<div class="tk"><b>${inline(c[0])}</b> <span class="px">${ci >= 0 ? inline(c[ci]) : ""}</span>
        ${si >= 0 ? `<div class="bi"><span class="ok">S</span> ${inline(clip(first(c[si]), 60))}</div>` : ""}${ri >= 0 ? `<div class="bi"><span class="bad">R</span> ${inline(clip(first(c[ri]), 60))}</div>` : ""}
        ${bi >= 0 ? `<div class="bi am">${inline(clip((c[bi] || "").split(/(?<=\.)\s/)[0], 110))}</div>` : ""}</div>`);
    }
    return cards.length ? `<div class="dimk" style="font-size:10px">AT A GLANCE · first support / first resistance / bias line, from the table below</div><div class="tk-grid">${cards.join("")}</div>` : "";
  }
  function renderSheet() {
    const O = D.outbox || [];
    $("dr-tabs").innerHTML = O.map((o, i) => `<button class="btn ${i === sheetIdx ? "on" : ""}" type="button" data-sheet="${i}">${esc(o.file.replace(/^outbox\//, "").replace(/\.md$/, ""))}</button>`).join(" ");
    const o = O[sheetIdx];
    $("dr-body").innerHTML = o ? `<div class="sub" style="margin:0 0 6px">${esc(o.file)} · changed ${esc(o.mtime || "—")} · ${o.awaiting_jeffrey ? '<span class="am">awaiting Jeffrey</span>' : "status: " + esc(o.status || "not recorded")}</div>${tickerCards(o.markdown)}<div class="md">${md(o.markdown)}</div>`
      : `<div class="empty">Outbox is empty.</div>`;
  }
  function openSheet(i) { sheetIdx = i || 0; renderSheet(); $("drawer").hidden = false; document.body.style.overflow = "hidden"; if (location.hash !== "#sheet") history.replaceState(null, "", "#sheet"); }
  function closeSheet() { $("drawer").hidden = true; document.body.style.overflow = ""; if (location.hash) history.replaceState(null, "", location.pathname); }

  /* ---------------- handoff graph ---------------- */
  const LAY = {
    wide: { vb: [1000, 700], ring: { cx: 350, cy: 350, r: 262, gap: 0, span: 30 }, r: 22, lab: 12,
      n: { grok: [150, 350], cash: [355, 175], compass: [355, 350], scout: [355, 525], hal: [650, 350], check: [770, 350], outbox: [880, 350], jeff: [965, 350] },
      up: { check: 1, jeff: 1 }, selfHal: "M150,350 C220,690 560,690 650,350" },
    tall: { vb: [400, 800], ring: { cx: 200, cy: 210, r: 172, gap: 90, span: 34 }, r: 20, lab: 0,
      n: { grok: [200, 98], cash: [88, 220], compass: [200, 302], scout: [312, 220], hal: [200, 460], check: [200, 565], outbox: [200, 665], jeff: [200, 760] },
      up: {}, selfHal: "M200,98 C-70,240 -30,430 200,460" }
  };
  const RANK = { none: 0, pend: 1, done: 2, ok: 3, bad: 4, act: 5 };
  function graphModel() {
    const J = D.jobs || [], E = {}, N = {};
    const set = (a, b, st) => { const k = a + ">" + b; if (!E[k] || RANK[st] > RANK[E[k]]) E[k] = st; };
    const nset = (k, st) => { if (!N[k] || RANK[st] > RANK[N[k]]) N[k] = st; };
    const r = runFor(D.night);
    if (r && r.sections.some(s => s.kind === "plan")) nset("grok", "done");
    for (const j of J) {
      const k = keyOf(j.owner); if (!k || k === "grok" || k === "check") continue;
      const s = j.status;
      if (s === "queued" || s === "pending") { set("grok", k, "pend"); nset(k, "pend"); }
      else if (s === "running") { set("grok", k, "done"); nset(k, "act"); }
      else if (s === "needs_review") { set("grok", k, "done"); if (k !== "hal") set(k, "hal", "act"); set("hal", "check", "act"); nset(k, "act"); nset("check", "act"); }
      else if (s === "approved") { set("grok", k, "ok"); if (k !== "hal") set(k, "hal", "ok"); set("hal", "check", "ok"); set("check", "outbox", "ok"); nset(k, "ok"); }
      else if (s === "rejected") { set("grok", k, "done"); if (k !== "hal") set(k, "hal", "done"); set("hal", "check", "bad"); nset(k, "bad"); }
    }
    const O = D.outbox || [], aw = O.filter(o => o.awaiting_jeffrey).length;
    if (O.length) nset("outbox", "ok");
    if (aw) { set("outbox", "jeff", "act"); nset("jeff", "act"); }
    else if (O.length) set("outbox", "jeff", "done");
    if (r && r.sections.some(s => s.kind === "check")) nset("check", "ok");
    return { E, N, aw };
  }
  function nodeText(k) {
    const J = D.jobs || [], cap = D.caps.calls, mine = J.filter(j => keyOf(j.owner) === k);
    const O = D.outbox || [], aw = O.filter(o => o.awaiting_jeffrey).length;
    const si = Object.fromEntries(((D.sources_index || {}).per_job || []).map(p => [p.id, p.links]));
    const j0 = mine[0], l1 = j0 ? `${STLABEL[j0.status] || j0.status} · ${j0.calls_used ?? "n/r"}/${cap}` : "no job tonight", l2 = j0 ? `${si[j0.id] ?? 0} links cited` : "idle";
    switch (k) {
      case "grok": return ["Grok Bot", "router / plan", (D.dispatch || [])[0] ? "plan " + D.dispatch[0].time : "plan: not run yet", (D.dispatch || [])[1] ? "dispatch " + D.dispatch[1].time : "no dispatch logged"];
      case "hal": { const r = runFor(D.night), c = r && r.sections.find(s => s.kind === "compile"); return ["Hal", "chief of staff", l1, c && c.time ? "compile " + c.time : l2]; }
      case "check": { const a = J.filter(j => j.status === "approved").length, x = J.filter(j => j.status === "rejected").length; return ["5:30 Check", "reviewer", D.check_time ? "ran " + D.check_time : "not run yet", D.check_time ? `✓${a} ✗${x}` : ""]; }
      case "outbox": return ["outbox", "deliverables", O.length ? `${O.length} file${O.length > 1 ? "s" : ""}` : "empty", O.length ? "newest " + ((O[0].mtime || "").replace(/^\d{4}-\d{2}-\d{2}\s*/, "").replace(/:\d\d PT$/, " PT") || "—") : ""];
      case "jeff": return ["Jeffrey", "human gate", aw ? `${aw} awaiting` : "nothing awaiting", aw ? "approval" : ""];
      default: return [({ cash: "Cash Money", compass: "Compass", scout: "SiteScout" })[k], "worker", l1, l2];
    }
  }
  const COL = { none: "#3a4a58", pend: "#7f93a4", done: "#22d3ee", ok: "#3ddc97", bad: "#ff5d6c", act: "#f5b041" };
  function curve(a, b, bend) {
    const [x1, y1] = a, [x2, y2] = b, mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
    return `M${x1},${y1} Q${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${x2},${y2}`;
  }
  function renderGraph() {
    const svg = $("graph"), w = $("gwrap").clientWidth || 800, L = w < 560 ? LAY.tall : LAY.wide;
    svg.setAttribute("viewBox", `0 0 ${L.vb[0]} ${L.vb[1]}`);
    const { E, N, aw } = graphModel(), P = L.n, si = D.sources_index || {}, Ds = si.domains || [];
    let s = `<title id="g-title">Handoff graph for the night of ${esc(pretty(D.night))}</title>
      <defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <radialGradient id="rg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0b2a36" stop-opacity=".55"/><stop offset="1" stop-color="#05070a" stop-opacity="0"/></radialGradient></defs>`;
    const R = L.ring;
    s += `<circle cx="${R.cx}" cy="${R.cy}" r="${R.r + 30}" fill="url(#rg)"/><circle cx="${R.cx}" cy="${R.cy}" r="${R.r}" fill="none" stroke="#12212c" stroke-dasharray="1 5"/>`;
    // domain dots around the ring (gap where the handoff path leaves the worker cluster)
    const nD = Ds.length, a0 = (R.gap + R.span) * Math.PI / 180, a1 = (R.gap + 360 - R.span) * Math.PI / 180;
    const gcd = (x, y) => y ? gcd(y, x % y) : x; let step = Math.max(1, Math.round(nD * 0.38)); while (nD > 1 && gcd(step, nD) !== 1) step++;
    const pos = {}; Ds.forEach((d, i) => { const slot = nD > 1 ? (i * step) % nD : 0, a = nD > 1 ? a0 + (a1 - a0) * slot / (nD - 1) : Math.PI; pos[d.domain] = [R.cx + R.r * Math.cos(a), R.cy + R.r * Math.sin(a), a]; });
    // filaments: one per real cited link, worker -> domain
    let fil = "", li = 0;
    const ownerCol = { cash: "#3ddc97", compass: "#22d3ee", scout: "#a78bfa", hal: "#f5b041" };
    for (const j of D.jobs || []) {
      const k = keyOf(j.owner); if (!P[k]) continue;
      for (const x of j.sources || []) for (const u of x.urls) {
        let h = ""; try { h = new URL(u).hostname.replace(/^www\./, ""); } catch (e) { continue; }
        const p = pos[h]; if (!p) continue;
        const bend = ((li * 37) % 11 - 5) / 22; li++;
        fil += `<path class="fil" stroke="${ownerCol[k] || "#22d3ee"}" d="${curve(P[k], [p[0], p[1]], bend)}"><title>${esc(j.owner)} → ${esc(h)}</title></path>`;
      }
    }
    s += `<g>${fil}</g>`;
    s += Ds.map((d, i) => { const [x, y, a] = pos[d.domain], rr = 1.6 + Math.min(4, d.links * .55), lab = i < L.lab;
      const tx = x + Math.cos(a) * 9, ty = y + Math.sin(a) * 9 + 3, anc = Math.cos(a) < -0.2 ? "end" : Math.cos(a) > 0.2 ? "start" : "middle";
      return `<circle class="ddot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="${d.links > 2 ? "#7be3f3" : "#3d7f91"}"><title>${esc(d.domain)}: ${d.links} link${d.links > 1 ? "s" : ""} (${esc(d.owners.join(", "))})</title></circle>${lab ? `<text class="dl" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anc}">${esc(d.domain)} ${d.links}</text>` : ""}`; }).join("");
    // handoff edges
    const edges = [];
    for (const k of ["cash", "compass", "scout"]) { edges.push(["grok", k, 0.12]); edges.push([k, "hal", -0.12]); }
    edges.push(["hal", "check", 0], ["check", "outbox", 0], ["outbox", "jeff", 0]);
    let base = "", lit = "";
    for (const [a, b, bend] of edges) {
      const d = curve(P[a], P[b], bend), st = E[a + ">" + b] || "none";
      base += `<path class="base" d="${d}"/>`;
      if (st !== "none") lit += `<path class="e flow ${st}" d="${d}"><title>${esc(a)} → ${esc(b)}: ${st}</title></path>`;
    }
    base += `<path class="base" d="${L.selfHal}"/>`;
    const hs = E["grok>hal"]; if (hs) lit += `<path class="e flow ${hs}" d="${L.selfHal}"><title>Grok Bot → Hal (Hal's own job): ${hs}</title></path>`;
    s += `<g>${base}</g><g filter="url(#glow)">${lit}</g>`;
    // nodes
    const INI = { grok: "GB", hal: "HAL", cash: "$$", compass: "CP", scout: "SS", check: "5:30", outbox: "OUT", jeff: "JEF" };
    for (const k of Object.keys(P)) {
      const [x, y] = P[k], st = N[k] || "none", c = COL[st], [nm, role, s1, s2] = nodeText(k), sub = s1 + (s2 ? " · " + s2 : ""), r = k === "jeff" ? L.r + 3 : L.r;
      const up = L.up[k], ty = up ? y - r - 34 : y + r + 15, sq = k === "jeff" || k === "outbox";
      s += `<g class="nd ${st === "act" ? "active" : ""}" filter="url(#glow)"><title>${esc(nm)} (${esc(role)}): ${esc(sub)}</title>
        ${sq ? `<rect class="halo" x="${x - r - 4}" y="${y - r - 4}" width="${2 * r + 8}" height="${2 * r + 8}" stroke="${c}"/><rect class="ring" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" stroke="${c}"/>`
          : `<circle class="halo" cx="${x}" cy="${y}" r="${r + 5}" stroke="${c}"/><circle class="ring" cx="${x}" cy="${y}" r="${r}" stroke="${c}"/>`}
        <text class="ini" x="${x}" y="${y}" fill="${c}" style="fill:${c}">${INI[k]}</text></g>
        <text class="lbl" x="${x}" y="${ty}" text-anchor="middle">${esc(nm)}</text>
        <text class="sl" x="${x}" y="${ty + 12}" text-anchor="middle">${esc(s1)}</text>${s2 ? `<text class="sl" x="${x}" y="${ty + 23}" text-anchor="middle">${esc(s2)}</text>` : ""}`;
    }
    svg.innerHTML = s;
    $("g-sub").textContent = `night ${pretty(D.night)} · ${(D.jobs || []).length} jobs · ${si.total_links || 0} cited links → ${Ds.length} domains`;
    // stage strip from the run log, with explicit empty states
    const r = runFor(D.night), want = ["plan", "hal_review", "dispatch", "compile", "check", "brief"];
    $("stages").innerHTML = want.map(k => { const x = r && r.sections.find(s => s.kind === k);
      const t = k === "dispatch" && x && x.body_times && x.body_times[0] ? x.body_times[0] : k === "check" && D.check_time ? D.check_time : (x && x.time);
      return x ? `<span class="stg"><span class="tm">${esc(t || "—")}</span> ${esc(KL[k])}</span>` : `<span class="stg miss">${esc(KL[k])}: not run yet</span>`; }).join("") +
      `<span class="stg">${aw ? `<span class="am">gate</span> ${aw} awaiting Jeffrey` : "gate: nothing awaiting"}</span>`;
    $("legend").innerHTML = `<span><i style="border-color:#3ddc97"></i>approved path</span><span><i style="border-color:#22d3ee"></i>dispatched / running</span><span><i style="border-color:#f5b041"></i>waiting (review or Jeffrey)</span><span><i style="border-color:#7f93a4;border-top-style:dashed"></i>queued</span><span><i style="border-color:#ff5d6c"></i>rejected</span><span>hairlines = one per cited source link, colored by bot</span>`;
  }

  /* ---------------- wiring ---------------- */
  function render() {
    renderBar(); renderBrief(); renderSources(); renderRules(); renderBudget(); renderPrior();
    renderGraph(); renderPlanner(); renderJobs(); renderSrcIdx(); renderRunlog(); renderDispatch(); renderGate();
    if (!$("drawer").hidden) renderSheet();
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-sheet],[data-close],[data-rl],#open-sheet"); if (!t || !D) return;
    if (t.id === "open-sheet") openSheet(0);
    else if (t.hasAttribute("data-close")) closeSheet();
    else if (t.hasAttribute("data-rl")) { rlDate = t.getAttribute("data-rl"); renderRunlog(); }
    else if (t.hasAttribute("data-sheet")) { if ($("drawer").hidden) openSheet(+t.getAttribute("data-sheet")); else { sheetIdx = +t.getAttribute("data-sheet"); renderSheet(); } }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("drawer").hidden) closeSheet(); });
  let rz = null, lastW = 0;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { const w = $("gwrap").clientWidth; if (D && Math.abs(w - lastW) > 40) { lastW = w; renderGraph(); } }, 150); });
  async function load() {
    try {
      const r = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      if (!D || d.built_at_iso !== D.built_at_iso) { D = d; render(); lastW = $("gwrap").clientWidth; if (location.hash === "#sheet" && $("drawer").hidden) openSheet(0); }
    } catch (e) {
      if (!D) $("b-night").textContent = "Could not load the board snapshot (" + e.message + ")";
    }
  }
  tickClock(); setInterval(tickClock, 1000);
  load(); setInterval(load, 5 * 60 * 1000);
})();
