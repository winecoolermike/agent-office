/* Agent Office: renders data.json (scrubbed board snapshot). No libraries. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const RM = window.matchMedia("(prefers-reduced-motion: reduce)");
  const TZ = "America/Los_Angeles";
  let D = null, replayTimer = null, replaying = false;

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

  /* ---------------- time helpers (PT) ---------------- */
  const ptParts = (d = new Date()) => {
    const p = {}; new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: false, weekday: "short" })
      .formatToParts(d).forEach(x => p[x.type] = x.value);
    return { h: (+p.hour) % 24, m: +p.minute, wd: p.weekday };
  };
  const toMin = t => { const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(t || ""); if (!m) return null; let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; return h * 60 + +m[2]; };
  const nowMin = () => { const p = ptParts(); return p.h * 60 + p.m; };
  const prettyDate = iso => { if (!iso) return "—"; const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };

  /* ---------------- sprites ---------------- */
  const PAL = {
    grok: { head: "#d9dde8", body: "#3b4252", acc: "#ffcc33", eye: "#36e3ff", c: "#ffcc33" },
    hal: { head: "#2f2f38", body: "#6b4fa0", acc: "#ff3b3b", eye: "#ff3b3b", c: "#b48cff" },
    cash: { head: "#9fe3a3", body: "#1f7a3d", acc: "#ffd84a", eye: "#10301a", c: "#4ade80" },
    compass: { head: "#9cc8ff", body: "#2856a6", acc: "#ff5a5a", eye: "#0c1c3a", c: "#7aa2ff" },
    scout: { head: "#ffc58f", body: "#c0602a", acc: "#5b3a1e", eye: "#2a1405", c: "#fb923c" },
    check: { head: "#a9f0e6", body: "#14796f", acc: "#f3efe2", eye: "#0b2c28", c: "#2dd4bf" },
  };
  function sprite(key) {
    const p = PAL[key], r = (x, y, w, h, f, cls = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"${cls ? ` class="${cls}"` : ""}/>`;
    let s = `<svg viewBox="0 0 12 16" width="100%" aria-hidden="true">`;
    // antenna / hat
    if (key === "scout") s += r(2, 1, 8, 2, p.acc) + r(1, 2, 10, 1, p.acc);
    else s += r(5, 0, 2, 1, p.acc) + r(5.5, 1, 1, 1, "#888");
    s += r(2, 2, 8, 6, p.head) + r(2, 7, 8, 1, "rgba(0,0,0,.18)");
    if (key === "hal") s += r(4, 3, 4, 4, "#111") + r(5, 4, 2, 2, p.eye);
    else s += r(4, 4, 1, 2, p.eye) + r(7, 4, 1, 2, p.eye) + r(5, 6, 2, 1, "rgba(0,0,0,.35)");
    s += r(2, 8, 8, 5, p.body) + r(2, 12, 8, 1, "rgba(0,0,0,.2)");
    if (key === "cash") s += r(5.5, 8.5, 1, 4, p.acc) + r(4.5, 9, 3, 1, p.acc) + r(4.5, 11, 3, 1, p.acc);
    if (key === "compass") s += r(4.5, 9, 3, 3, "#e8eefc") + r(5.5, 9, 1, 1.5, p.acc);
    if (key === "hal") s += r(5.5, 8, 1, 4, "#ff3b3b");
    if (key === "grok") s += r(4, 9, 4, 2, "#2a2f3a") + r(4.5, 9.5, 1, 1, p.eye) + r(6.5, 9.5, 1, 1, p.eye);
    if (key === "check") s += r(4, 8.5, 4, 4, p.acc) + r(4.5, 9.5, 3, .6, "#555") + r(4.5, 10.8, 3, .6, "#555");
    s += `<g class="armA">${r(1, 9, 1, 3, p.head)}${r(10, 9, 1, 3, p.head)}</g><g class="armB">${r(1, 8, 1, 3, p.head)}${r(10, 10, 1, 3, p.head)}</g>`;
    s += `<g class="legA">${r(3, 13, 2, 3, "#22263a")}${r(7, 13, 2, 3, "#22263a")}</g><g class="legB">${r(3, 13, 2, 2, "#22263a")}${r(7, 13, 2, 3, "#22263a")}${r(2.5, 15, 2, 1, "#22263a")}</g>`;
    return s + "</svg>";
  }
  const CHECK = `<svg class="badge ok" viewBox="0 0 8 8"><rect width="8" height="8" rx="1" fill="#16a34a"/><path d="M1.6 4.2 3.2 5.8 6.4 2.4" stroke="#fff" stroke-width="1.2" fill="none"/></svg>`;
  const XMARK = `<svg class="badge no" viewBox="0 0 8 8"><rect width="8" height="8" rx="1" fill="#dc2626"/><path d="M2 2 6 6M6 2 2 6" stroke="#fff" stroke-width="1.2"/></svg>`;
  const FOLDER = `<svg class="folder" viewBox="0 0 8 6"><rect x="0" y="0" width="3" height="1" fill="#d99a1e"/><rect x="0" y="1" width="8" height="5" fill="#f7c948"/><rect x="0" y="1" width="8" height="1" fill="#e3b02f"/></svg>`;
  function desk(key, deco) {
    const r = (x, y, w, h, f, cls = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"${cls ? ` class="${cls}"` : ""}/>`;
    let s = `<svg viewBox="0 0 40 26" width="100%" aria-hidden="true">`;
    s += r(3, 1, 13, 9, "#1d2233") + r(4, 2, 11, 7, "#34405f", "screen") + r(8, 10, 3, 1, "#1d2233");
    s += r(0, 10, 40, 5, "#b07a4f") + r(0, 10, 40, 1, "#c99366") + r(0, 15, 40, 8, "#7b4f2e") + r(1, 23, 3, 3, "#4a2f1b") + r(36, 23, 3, 3, "#4a2f1b");
    s += r(18, 12, 9, 2, "#2b2f40") + r(19, 12.5, 7, 1, "#454b63");
    if (deco === "mug") s += r(31, 8, 3, 3, "#e8e8e8") + r(34, 9, 1, 1.5, "#e8e8e8");
    if (deco === "plant") s += r(31, 9, 4, 2, "#8a4b2a") + r(31, 5, 1, 4, "#3fa34d") + r(33, 4, 1, 5, "#4cc35b") + r(34, 6, 1, 3, "#3fa34d");
    if (deco === "papers") s += r(29, 10, 7, 2, "#f1f1f1") + r(30, 9, 6, 1, "#ddd");
    if (deco === "lamp") s += r(33, 4, 1, 6, "#666") + r(31, 3, 5, 2, "#ffd84a");
    return s + "</svg>";
  }

  /* ---------------- layout (percent of scene) ---------------- */
  const SEATS = { cash: [18, 33, "papers"], compass: [50, 33, "plant"], scout: [82, 33, "mug"], grok: [18, 63, "lamp"], hal: [50, 63, "mug"], check: [82, 63, "papers"] };
  const AISLE = { 33: 62, 63: 95 };
  const seat = k => { const [x, t] = SEATS[k]; return [x + 3, t + 12.5]; };
  const stand = k => { const [x, t] = SEATS[k]; return [x, AISLE[t]]; };

  function statusMode(c, live) {
    const st = c.status;
    if (c.key === "grok" && live.dispatch) return "dispatch";
    if (c.key === "check" && (D.with_checker || []).length) return "reviewing";
    if (st === "running") return "running";
    if (st === "needs_review") return "review";
    if (st === "approved") return "approved";
    if (st === "rejected") return "rejected";
    return "idle";
  }

  function dispatchWindow() {
    const n = nowMin();
    for (const d of D.dispatch || []) {
      const t = toMin(d.time); if (t == null) continue;
      let diff = n - t; if (diff < -720) diff += 1440; if (diff > 720) diff -= 1440;
      if (diff >= -5 && diff <= 25) return d;
    }
    return null;
  }

  function buildScene() {
    const sc = $("scene"); const p = ptParts();
    const sky = (p.h >= 7 && p.h < 17) ? "day" : ((p.h >= 17 && p.h < 19) || (p.h >= 5 && p.h < 7)) ? "dusk" : "night";
    let stars = ""; for (let i = 0; i < 9; i++) stars += `<i class="star" style="left:${(i * 37) % 92 + 4}%;top:${(i * 53) % 70 + 8}%"></i>`;
    const win = l => `<div class="win ${sky}" style="left:${l}%">${sky === "day" ? '<i class="sun" style="left:62%;top:14%"></i>' : stars + '<i class="moon" style="left:64%;top:12%"></i>'}</div>`;
    const jobs = D.jobs || [], cnt = s => jobs.filter(j => j.status === s).length;
    let h = `<div class="wall">${win(6)}${win(23)}<div class="sign">AGENT OFFICE</div>
      <div class="board"><b>${esc(prettyDate(D.night))}</b> night<br>${jobs.length} jobs · ✓${cnt("approved")} ✗${cnt("rejected")}<br>run ${cnt("running")} · review ${cnt("needs_review")} · queue ${cnt("queued") + cnt("pending")}</div>
      <div class="wclock" id="wclock"></div></div><div class="floor"></div><div class="rug"></div>`;
    h += `<svg class="plant" style="left:1%;top:80%" viewBox="0 0 10 16"><rect x="2" y="11" width="6" height="5" fill="#8a4b2a"/><rect x="4" y="2" width="2" height="9" fill="#3fa34d"/><rect x="1" y="5" width="3" height="2" fill="#4cc35b"/><rect x="6" y="3" width="3" height="2" fill="#4cc35b"/><rect x="6" y="7" width="3" height="2" fill="#3fa34d"/></svg>`;
    h += `<svg class="cooler" style="left:94%;top:82%" viewBox="0 0 8 16"><rect x="1" y="0" width="6" height="5" fill="#9fd3ff"/><rect x="0" y="5" width="8" height="11" fill="#e5e7eb"/><rect x="2" y="7" width="2" height="1" fill="#3b82f6"/></svg>`;
    for (let i = 0; i < 14; i++) h += `<i class="confetti" style="left:${(i * 29) % 96 + 2}%;top:${30 + (i * 13) % 20}%;background:${["#4ade80", "#fbbf24", "#60a5fa", "#f472b6"][i % 4]};animation-delay:${(i % 7) * .3}s"></i>`;
    for (const c of D.cast) {
      const [x, t, deco] = SEATS[c.key];
      h += `<div class="desk" id="desk-${c.key}" style="left:${x}%;top:${t}%;--z:${Math.round((t + 20) * 10)}">${desk(c.key, deco)}</div>`;
    }
    for (const c of D.cast) {
      h += `<div class="bot" id="bot-${c.key}" style="--c:${PAL[c.key].c}"><div class="sprite">${sprite(c.key)}${CHECK}${XMARK}${FOLDER}</div><span class="bubble"></span><span class="tag">${esc(c.name)}</span></div>`;
    }
    sc.innerHTML = h;
    tickClock();
  }

  function routeKeyframes(stops) {
    // stops: [[x,y],...] closed loop; equal time per leg plus dwell
    const n = stops.length; let css = "@keyframes route{";
    stops.forEach((s, i) => { const a = (i / n) * 100, b = a + 100 / n * .45; css += `${a.toFixed(1)}%,${b.toFixed(1)}%{left:${s[0]}%;top:${s[1]}%}`; });
    css += `100%{left:${stops[0][0]}%;top:${stops[0][1]}%}}`;
    let st = document.getElementById("route-kf"); if (!st) { st = document.createElement("style"); st.id = "route-kf"; document.head.appendChild(st); }
    st.textContent = css;
  }

  function place(c, mode) {
    const el = $("bot-" + c.key); if (!el) return;
    el.className = "bot " + mode;
    const bub = el.querySelector(".bubble"); bub.textContent = "";
    let [x, y] = seat(c.key);
    const deskEl = $("desk-" + c.key); deskEl && deskEl.classList.toggle("on", mode === "running" || mode === "reviewing");
    const target = c.key === "hal" ? [SEATS.check[0] - 12, SEATS.check[1] + 14] : [SEATS.hal[0] - 13, SEATS.hal[1] + 14];
    if (mode === "idle") {
      [x, y] = stand(c.key);
      const span = c.key === "grok" || c.key === "check" ? 7 : 6;
      el.style.setProperty("--x2", (x + (c.key.length % 2 ? span : -span)) + "%");
      el.style.setProperty("--dur", (7 + c.key.length) + "s");
    } else if (mode === "approved" || mode === "rejected") {
      [x, y] = stand(c.key);
    } else if (mode === "review") {
      el.style.setProperty("--ay", AISLE[33] + "%");
      el.style.setProperty("--tx", target[0] + "%"); el.style.setProperty("--ty", target[1] + "%");
      bub.textContent = c.key === "hal" ? "→ 5:30 Check" : "→ Hal";
      if (RM.matches) [x, y] = target;
    } else if (mode === "running") bub.textContent = "typing…";
    else if (mode === "reviewing") bub.textContent = `reviewing ${D.with_checker.length}`;
    else if (mode === "dispatch") {
      const owners = D.cast.filter(o => o.jobs.length && o.key !== "grok");
      const stops = [seat("grok"), stand("grok")].concat((owners.length ? owners : D.cast.filter(o => o.key !== "grok")).map(o => [SEATS[o.key][0], AISLE[33]])).concat([[SEATS.grok[0], AISLE[33]]]);
      routeKeyframes(stops); el.style.setProperty("--dur", (stops.length * 1.6) + "s");
      bub.textContent = "jobs!";
      if (RM.matches) [x, y] = stops[2] || stand("grok");
    }
    el.style.setProperty("--x", x + "%"); el.style.setProperty("--y", y + "%");
    el.style.zIndex = Math.round(y * 10) + (mode === "running" || mode === "reviewing" ? 0 : 400);
    el.style.left = x + "%"; el.style.top = y + "%";
  }

  function liveScene() {
    if (replaying) return;
    const d = dispatchWindow();
    const modes = {};
    for (const c of D.cast) { modes[c.key] = statusMode(c, { dispatch: !!d }); place(c, modes[c.key]); }
    $("scene").classList.toggle("party", (D.jobs || []).length > 0 && D.jobs.every(j => j.status === "approved"));
    const desc = { idle: "idle", running: "running: typing at the desk", review: "needs review: carrying a folder", approved: "approved", rejected: "rejected", dispatch: "handing out jobs", reviewing: "reviewing jobs" };
    $("roster").innerHTML = D.cast.map(c => {
      let s = c.status ? `<span class="st st-${esc(c.status)}">${esc(c.status.replace("_", " "))}</span>` : `<span class="st st-none">no job tonight</span>`;
      let extra = c.jobs.length ? ` <span class="dim">${esc(c.jobs.join(", "))}</span>` : "";
      if (c.key === "grok") extra = d ? ` <span class="dim">${esc(d.time)}: ${esc(d.what)}</span>` : ` <span class="dim">hands out jobs ${esc((D.dispatch || []).map(x => x.time).join(" & ") || "(no run-log times)")}</span>`;
      if (c.key === "check") {
        const chk = (D.runs[0] || { sections: [] }).sections.find(s => s.kind === "check");
        extra = (D.with_checker || []).length ? ` <span class="dim">reviewing ${D.with_checker.length}</span>` : chk ? ` <span class="dim">last ran ${esc(D.check_time || chk.time || "")}</span>` : ` <span class="dim">not run yet</span>`;
      }
      return `<li><b>${esc(c.name)}</b> ${s}${extra}<br><span class="dim">${esc(desc[modes[c.key]])}</span></li>`;
    }).join("");
    const parts = [];
    if (d) parts.push(`Grok Bot is on its ${esc(d.time)} round (${esc(d.what)}).`);
    const n = (D.jobs || []).length;
    parts.push(n ? `Showing ${n} job${n > 1 ? "s" : ""} from the night of ${esc(prettyDate(D.night))}, the newest on the board.` : "No jobs on the board yet.");
    $("caption").innerHTML = parts.join(" ");
  }

  function replay() {
    if (replaying) return;
    replaying = true; $("replay").disabled = true;
    const run = D.runs[0] || { sections: [] }; const sec = k => run.sections.find(s => s.kind === k);
    const owners = D.cast.filter(c => c.jobs.length);
    const ok = D.jobs.filter(j => j.status === "approved").length, bad = D.jobs.filter(j => j.status === "rejected").length;
    const plan = sec("plan"), disp = sec("dispatch"), comp = sec("compile"), chk = sec("check");
    const steps = [
      [6500, `${plan ? esc(plan.time) + " plan, " : ""}${disp ? esc((disp.body_times[0] || disp.time)) : ""}: Grok Bot hands ${D.jobs.length} jobs to ${owners.map(o => esc(o.name)).join(", ")}.`, c => c.key === "grok" ? "dispatch" : "idle"],
      [4500, "Workers run their jobs.", c => c.jobs.length ? "running" : "idle"],
      [7000, `${comp ? esc(comp.time) + " " : ""}Hal compiles; finished jobs go to needs_review and are walked over.`, c => c.jobs.length ? "review" : (c.key === "check" ? "reviewing" : "idle")],
      [5000, chk ? `${esc(D.check_time || chk.time)} 5:30 check: ${ok} approved, ${bad} rejected.` : "5:30 check: not run yet.", c => c.status === "approved" ? "approved" : c.status === "rejected" ? "rejected" : c.jobs.length ? "review" : "idle"],
    ];
    const saved = D.with_checker; let i = 0;
    const go = () => {
      if (i >= steps.length) { replaying = false; D.with_checker = saved; $("replay").disabled = false; liveScene(); return; }
      const [ms, cap, fn] = steps[i++];
      D.with_checker = i === 3 ? D.jobs.map(j => j.id) : [];
      for (const c of D.cast) place(c, fn(c));
      $("scene").classList.toggle("party", i === 4 && ok > 0);
      $("caption").innerHTML = `<b>Replay of the newest run log</b> · ${cap}`;
      replayTimer = setTimeout(go, RM.matches ? Math.max(ms, 4000) : ms);
    };
    go();
  }

  /* ---------------- feed ---------------- */
  const KL = { plan: "Plan", hal_review: "Hal review", dispatch: "Hand-off", compile: "Hal compile", check: "5:30 check", brief: "6:30 brief", other: "Log" };
  function entry(s) {
    return `<div class="entry"><div class="hd"><span class="kind ${s.kind}">${KL[s.kind] || "Log"}</span><span class="h">${inline(s.heading)}</span></div><div class="md">${md(s.body)}</div></div>`;
  }
  const emptyE = (kind, txt) => `<div class="entry empty"><span class="kind ${kind}">${KL[kind]}</span> ${esc(txt)}</div>`;
  function tickerStrip(mdText) {
    const L = (mdText || "").split("\n"); const i = L.findIndex(l => /^\|\s*Ticker\s*\|/i.test(l)); if (i < 0) return "";
    const hdr = L[i].replace(/^\||\|$/g, "").split("|").map(c => c.trim().toLowerCase());
    const bi = hdr.findIndex(h => h.startsWith("bias")); if (bi < 0) return "";
    const rows = []; for (let k = i + 2; k < L.length && /^\s*\|/.test(L[k]); k++) {
      const c = L[k].trim().replace(/^\||\|$/g, "").split("|").map(x => x.trim());
      const bias = (c[bi] || "").split(/(?<=\.)\s/)[0];
      rows.push(`<tr><td data-label="Ticker">${inline(c[0])}</td><td data-label="Bias">${inline(bias)}</td></tr>`);
    }
    return `<div class="md"><div class="tw"><table><thead><tr><th>Ticker</th><th>Bias (first line)</th></tr></thead><tbody>${rows.join("")}</tbody></table></div></div>`;
  }
  function renderFeed() {
    let h = "";
    (D.outbox || []).slice(0, 2).forEach((o, i) => {
      h += `<div class="entry"><div class="hd"><span class="kind outbox">Outbox</span><span class="h">${esc(o.title || o.file)}</span></div>
        <div class="md"><p>${o.awaiting_jeffrey ? "<b>Awaiting Jeffrey</b> · " : ""}<span class="dim">${esc(o.file)} · changed ${esc(o.mtime || "—")}</span> · <a href="#ob-${i}">open sheet</a></p></div>${i === 0 ? tickerStrip(o.markdown) : ""}</div>`;
    });
    if (!(D.outbox || []).length) h += `<div class="entry empty"><span class="kind outbox">Outbox</span> Outbox is empty.</div>`;
    if (D.missing_night) {
      h += `<div class="night"><h3>Night of ${esc(prettyDate(D.missing_night.date))}</h3>${emptyE("plan", "Plan: not run yet.")}${emptyE("check", "5:30 check: not run yet.")}${emptyE("brief", "6:30 brief: not run yet.")}<p class="dim" style="font-size:12px">${esc(D.missing_night.note)}</p></div>`;
    }
    (D.runs || []).forEach((r, idx) => {
      const secs = r.sections.slice().reverse();
      const has = k => r.sections.some(s => s.kind === k);
      let inner = "";
      if (!has("brief")) inner += emptyE("brief", "6:30 brief: not run yet.");
      if (!has("check")) inner += emptyE("check", "5:30 check: not run yet.");
      inner += secs.map(entry).join("");
      if (!has("plan")) inner += emptyE("plan", "Plan: not in this log.");
      const title = `${esc(r.title || r.date)}`;
      h += idx === 0 ? `<div class="night"><h3>${title}</h3>${inner}</div>` :
        `<details class="night more"><summary>${title} · ${r.sections.length} entries</summary>${inner}</details>`;
    });
    if (!(D.runs || []).length) h += emptyE("plan", "No run logs yet.");
    $("feed").innerHTML = h;
  }

  /* ---------------- panels ---------------- */
  function renderBudget() {
    const cap = D.caps.calls, warn = D.caps.warn_pct;
    let h = `<p class="note" style="margin-top:0">Cap <b>${cap ?? "not stated"}</b> tool calls per bot per night${warn ? `, priority-1 only after ${warn}%` : ""}; $ cap <b>${D.caps.usd != null ? "$" + D.caps.usd : "not stated"}</b> (from BOARD.md). Night of ${esc(prettyDate(D.night))}.</p>`;
    for (const b of D.budget) {
      const pct = b.calls != null && cap ? Math.min(100, b.calls / cap * 100) : 0;
      const cls = b.calls != null && cap && b.calls > cap ? "o" : (warn && pct >= warn ? "w" : "");
      h += `<div class="brow"><span class="n">${esc(b.bot)}</span><span class="bar">${b.calls != null ? `<i class="${cls}" style="width:${pct}%"></i>` : ""}${warn ? `<u style="left:${warn}%"></u>` : ""}</span>
        <span class="v">${b.calls != null ? `${b.calls}/${cap}` : '<span class="nr">not recorded</span>'}</span>
        <span class="sp">$ spend: ${b.usd != null ? "$" + b.usd : '<span class="nr">not recorded</span>'}${b.note ? " · " + esc(b.note) : ""}${!b.jobs ? " · no job file tonight" : ""}</span></div>`;
    }
    const ts = D.team_spend;
    h += `<p class="note">${ts ? `Team spend recorded in the run log (${esc(ts.source)}): <b>$${esc(ts.values.join(", $"))}</b>. Per-bot $ is not recorded in the job files.` : "Team $ spend: <span class=\"nr\">not recorded</span>."} Calls are the sum of <code>calls_used</code> in each bot's job files for that night.</p>`;
    $("budget").innerHTML = h;
  }
  function renderAwaiting() {
    const aw = (D.outbox || []).map((o, i) => [o, i]).filter(([o]) => o.awaiting_jeffrey);
    $("awaiting").innerHTML = aw.length ? aw.map(([o, i]) => `<div class="item"><b>${esc(o.title || o.file)}</b>${i === 0 ? ' <span class="st st-needs_review">newest</span>' : ""}<div class="f">${esc(o.file)} · changed ${esc(o.mtime || "—")}</div><a href="#ob-${i}">Read it below</a></div>`).join("")
      : `<div class="empty-box">Nothing in the outbox is awaiting Jeffrey.</div>`;
    const rev = (D.jobs || []).filter(j => j.status === "needs_review");
    $("checker").innerHTML = rev.length ? rev.map(j => `<div class="item"><b>${esc(j.id)}</b> · ${esc(j.owner)} <span class="st st-needs_review">needs review</span></div>`).join("")
      : `<div class="empty-box">Nothing with the 5:30 checker right now (0 jobs in needs_review).</div>`;
  }
  const clip = (t, n) => { t = String(t || ""); return t.length > n ? t.slice(0, t.lastIndexOf(" ", n) > 0 ? t.lastIndexOf(" ", n) : n) + "…" : t; };
  function renderJobs() {
    const J = D.jobs || [];
    if (!J.length) { $("jobs").innerHTML = `<div class="empty-box">No job files on the board.</div>`; return; }
    $("jobs").innerHTML = `<p class="note" style="margin-top:0">Night of ${esc(prettyDate(D.night))}: ${J.length} jobs. Earlier nights: ${(D.older_jobs || []).length} jobs (${(D.older_jobs || []).filter(j => j.status === "approved").length} approved).</p>` + J.map(j => {
      const links = (j.sources || []).flatMap(s => s.urls.map(u => [s.label, u]));
      const labels = (j.sources || []).filter(s => !s.urls.length && s.label).map(s => s.label);
      return `<div class="job"><div class="row1"><b>${esc(j.owner)}</b><span class="st st-${esc(j.status || "none")}">${esc((j.status || "no status").replace("_", " "))}</span><span class="dim">P${esc(j.priority ?? "?")} · ${esc(j.id)} · ${j.calls_used != null ? esc(j.calls_used) + " calls" : "calls not recorded"}</span></div>
      <div class="task">${esc(clip(j.task, 170))}</div>
      ${j.review ? `<div class="task"><b>Review:</b> ${esc(clip(j.review, 150))}</div>` : ""}
      <details class="more"><summary>Full task${j.result ? ", result" : ""}${j.review ? " and review" : ""}</summary><div class="task">${inline(j.task || "")}</div>
      ${j.result ? `<div class="task"><b>Result:</b> ${inline(j.result)}</div>` : ""}
      ${j.review ? `<div class="task"><b>Review:</b> ${inline(j.review)}</div>` : ""}</details>
      <details class="more"><summary>Sources (${links.length} links)</summary><ul class="srcs">${links.map(([l, u]) => `<li>${l ? esc(l) + ": " : ""}${inline(u)}</li>`).join("")}${labels.map(l => `<li class="dim">${esc(l)}</li>`).join("")}</ul></details>
      ${j.evidence ? `<details class="more"><summary>Evidence</summary><div class="md">${md(j.evidence)}</div></details>` : ""}</div>`;
    }).join("");
  }
  function renderOutbox() {
    const O = D.outbox || [];
    $("outbox").innerHTML = O.length ? O.map((o, i) => i === 0
      ? `<article id="ob-${i}"><p class="dim" style="font-size:12px;margin:0">${esc(o.file)} · changed ${esc(o.mtime || "—")}</p><div class="md">${md(o.markdown)}</div></article>`
      : `<details class="more" id="ob-${i}"><summary>Older: ${esc(o.title || o.file)} (${esc(o.file)})</summary><div class="md">${md(o.markdown)}</div></details>`).join("")
      : `<div class="empty-box">Outbox is empty.</div>`;
  }
  function tickClock() {
    const s = new Date().toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
    if ($("clock")) $("clock").textContent = s + " PT";
    if ($("wclock")) $("wclock").textContent = s.replace(/\s?[AP]M/, "");
  }

  function render() {
    $("meta").innerHTML = `Last updated <b>${esc(D.built_at)}</b><br><span>Board last changed ${esc(D.board_newest_change || "—")}</span>`;
    buildScene(); liveScene(); renderFeed(); renderBudget(); renderAwaiting(); renderJobs(); renderOutbox();
  }
  async function load() {
    try {
      const r = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      if (!D || d.built_at_iso !== D.built_at_iso) { D = d; if (!replaying) render(); }
    } catch (e) {
      if (!D) $("meta").textContent = "Could not load the board snapshot (" + e.message + ").";
    }
  }
  $("replay").addEventListener("click", replay);
  load();
  setInterval(load, 5 * 60 * 1000);
  setInterval(() => { tickClock(); if (D && !replaying) liveScene(); }, 30 * 1000);
})();
