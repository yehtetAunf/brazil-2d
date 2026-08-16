// ============================================================
// BRAZIL 2D — Cloudflare Worker + D1
// Live SET / VALUE + Live 2D
// 6 Rounds + Admin Schedule + Auto Publish + Publish Now + Undo
// Final Admin Result Hold = 3 minutes
// ============================================================

const ROUNDS = [
  { time: "11:00 AM", minutes: 11 * 60, id: "r1100", field: "r1100", color: "green" },
  { time: "01:00 PM", minutes: 13 * 60, id: "r1300", field: "r1300", color: "yellow" },
  { time: "03:00 PM", minutes: 15 * 60, id: "r1500", field: "r1500", color: "blue" },
  { time: "05:00 PM", minutes: 17 * 60, id: "r1700", field: "r1700", color: "green" },
  { time: "07:00 PM", minutes: 19 * 60, id: "r1900", field: "r1900", color: "yellow" },
  { time: "09:00 PM", minutes: 21 * 60, id: "r2100", field: "r2100", color: "blue" }
];

const RESULT_HOLD_SECONDS = 180;
const MARKET_JUMP_MS = 10000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      await ensurePublishTable(env.DB);

      if (url.pathname === "/" && request.method === "GET") {
        return html(await mainPage(env.DB));
      }

      if (url.pathname === "/api/live" && request.method === "GET") {
        return json(await getLiveState(env.DB));
      }

      if (url.pathname === "/history" && request.method === "GET") {
        return html(await historyPage(env.DB));
      }

      if (url.pathname === "/admin" && request.method === "GET") {
        if (!(await isAdmin(request, env))) return html(adminLoginPage());
        return html(await adminPage(env.DB, url.searchParams.get("date"), url.searchParams.get("msg")));
      }

      if (url.pathname === "/admin/login" && request.method === "POST") {
        return adminLogin(request, env);
      }

      if (url.pathname === "/admin/logout") {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/admin",
            "Set-Cookie": "brazil_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
          }
        });
      }

      if (url.pathname === "/admin/save-schedule" && request.method === "POST") {
        if (!(await isAdmin(request, env))) return Response.redirect(new URL("/admin", request.url), 303);
        return saveSchedule(request, env);
      }

      if (url.pathname === "/admin/publish-now" && request.method === "POST") {
        if (!(await isAdmin(request, env))) return Response.redirect(new URL("/admin", request.url), 303);
        return publishNow(request, env);
      }

      if (url.pathname === "/admin/undo-publish" && request.method === "POST") {
        if (!(await isAdmin(request, env))) return Response.redirect(new URL("/admin", request.url), 303);
        return undoPublish(request, env);
      }

      if (url.pathname === "/admin/save-old-history" && request.method === "POST") {
        if (!(await isAdmin(request, env))) return Response.redirect(new URL("/admin", request.url), 303);
        return saveOldHistory(request, env);
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error(error);
      return new Response("Brazil 2D Error: " + error.message, {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=UTF-8" }
      });
    }
  }
};

// ============================================================
// DATABASE SETUP
// ============================================================

async function ensurePublishTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS publish_controls (
      result_date TEXT NOT NULL,
      round_time TEXT NOT NULL,
      auto_publish INTEGER NOT NULL DEFAULT 1,
      manual_publish INTEGER NOT NULL DEFAULT 0,
      suppressed INTEGER NOT NULL DEFAULT 0,
      published_at INTEGER,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (result_date, round_time)
    )
  `).run();
}

// ============================================================
// RESPONSE HELPERS
// ============================================================

function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function valid2D(value) {
  return /^\d{2}$/.test(String(value || ""));
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function calculate2D(setValue, valueValue) {
  const setDigits = String(setValue || "").replace(/\D/g, "");
  const valueInteger = String(valueValue || "").split(".")[0].replace(/\D/g, "");
  if (!setDigits || !valueInteger) return "";
  return setDigits.slice(-1) + valueInteger.slice(-1);
}

// ============================================================
// MYANMAR TIME
// ============================================================

function getYangonParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const v = {};
  for (const p of parts) if (p.type !== "literal") v[p.type] = p.value;
  let hour = Number(v.hour);
  if (hour === 24) hour = 0;

  return {
    year: Number(v.year), month: Number(v.month), day: Number(v.day),
    hour, minute: Number(v.minute), second: Number(v.second)
  };
}

function getMyanmarDate() {
  const p = getYangonParts();
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function getCurrentSeconds() {
  const p = getYangonParts();
  return p.hour * 3600 + p.minute * 60 + p.second;
}

function roundReleaseSeconds(round) {
  return round.minutes * 60;
}

// ============================================================
// ADMIN SESSION
// ============================================================

async function createSignature(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return arrayBufferToBase64Url(sig);
}

function arrayBufferToBase64Url(buffer) {
  let binary = "";
  for (const b of new Uint8Array(buffer)) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const piece of cookie.split(";")) {
    const [key, ...rest] = piece.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

async function createAdminToken(secret) {
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const data = String(expires);
  return data + "." + await createSignature(data, secret);
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const token = getCookie(request, "brazil_admin");
  if (!token) return false;
  const pieces = token.split(".");
  if (pieces.length !== 2 || Number(pieces[0]) < Date.now()) return false;
  return pieces[1] === await createSignature(pieces[0], env.ADMIN_PASSWORD);
}

async function adminLogin(request, env) {
  const form = await request.formData();
  const password = String(form.get("password") || "");

  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return html(adminLoginPage("Wrong password."), 401);
  }

  const token = await createAdminToken(env.ADMIN_PASSWORD);
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/admin", request.url).toString(),
      "Set-Cookie": "brazil_admin=" + token + "; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict"
    }
  });
}

// ============================================================
// LIVE MARKET SOURCE
// SET = BTC volume, VALUE = BTC price
// ============================================================

async function fetchLiveMarket() {
  const endpoint = "https://api.exchange.coinbase.com/products/BTC-USD/ticker";

  try {
    const upstream = await fetch(endpoint, {
      headers: { Accept: "application/json", "User-Agent": "Brazil-2D/1.0" },
      cf: { cacheTtl: 10, cacheEverything: true }
    });

    if (!upstream.ok) throw new Error("Market API HTTP " + upstream.status);
    const data = await upstream.json();
    const price = Number(data.price);
    const volume = Number(data.volume);

    return {
      ok: Number.isFinite(price) && Number.isFinite(volume),
      set: Number.isFinite(volume) ? volume.toFixed(2) : "--",
      value: Number.isFinite(price) ? price.toFixed(2) : "--",
      source: "Coinbase BTC-USD",
      fetched_at: new Date().toISOString()
    };
  } catch (error) {
    console.error("Market API error", error);
    return { ok: false, set: "--", value: "--", source: "Coinbase BTC-USD" };
  }
}

// ============================================================
// DB READ HELPERS
// ============================================================

async function getDayRows(DB, date) {
  const q = await DB.prepare(`
    SELECT result_date, round_time, result, set_value, market_value
    FROM results
    WHERE result_date = ?
  `).bind(date).all();
  return q.results || [];
}

async function getPublishRows(DB, date) {
  const q = await DB.prepare(`
    SELECT result_date, round_time, auto_publish, manual_publish, suppressed, published_at
    FROM publish_controls
    WHERE result_date = ?
  `).bind(date).all();
  return q.results || [];
}

// ============================================================
// LIVE STATE
// ============================================================

async function getLiveState(DB) {
  const today = getMyanmarDate();
  const nowSeconds = getCurrentSeconds();
  const rows = await getDayRows(DB, today);
  const controls = await getPublishRows(DB, today);
  const market = await fetchLiveMarket();

  const rowMap = new Map(rows.map(r => [r.round_time, r]));
  const ctrlMap = new Map(controls.map(r => [r.round_time, r]));
  const releasedResults = {};
  let resultHold = null;
  let latestReleased = null;

  for (const round of ROUNDS) {
    const row = rowMap.get(round.time);
    const ctrl = ctrlMap.get(round.time) || {
      auto_publish: 1, manual_publish: 0, suppressed: 0, published_at: null
    };

    const release = roundReleaseSeconds(round);
    const autoReleased = Number(ctrl.auto_publish) === 1 && nowSeconds >= release;
    const manualReleased = Number(ctrl.manual_publish) === 1;
    const suppressed = Number(ctrl.suppressed) === 1;
    const published = !suppressed && (autoReleased || manualReleased) && row && valid2D(row.result);

    if (published) {
      releasedResults[round.id] = row.result;
      latestReleased = { round, row };

      let holdElapsed = null;
      if (manualReleased && ctrl.published_at) {
        holdElapsed = Math.floor(Date.now() / 1000) - Number(ctrl.published_at);
      } else if (autoReleased) {
        holdElapsed = nowSeconds - release;
      }

      if (holdElapsed !== null && holdElapsed >= 0 && holdElapsed < RESULT_HOLD_SECONDS) {
        if (!resultHold || round.minutes >= (ROUNDS.find(r => r.time === resultHold.round_time)?.minutes || 0)) {
          resultHold = {
            active: true,
            round_time: round.time,
            result: row.result,
            set: row.set_value || market.set,
            value: row.market_value || market.value,
            elapsed_seconds: holdElapsed,
            seconds_remaining: RESULT_HOLD_SECONDS - holdElapsed
          };
        }
      }
    } else {
      releasedResults[round.id] = "--";
    }
  }

  let nextRound = null;
  for (const round of ROUNDS) {
    if (nowSeconds < roundReleaseSeconds(round)) {
      nextRound = { round_time: round.time, seconds_until: roundReleaseSeconds(round) - nowSeconds };
      break;
    }
  }

  return {
    success: true,
    date: today,
    serverNow: Date.now(),
    market,
    resultHold,
    nextRound,
    latest_result: latestReleased ? latestReleased.row.result : "--",
    latest_round: latestReleased ? latestReleased.round.time : null,
    results: releasedResults
  };
}

// ============================================================
// USER PAGE
// ============================================================

async function mainPage(DB) {
  const state = await getLiveState(DB);
  const hold = state.resultHold;
  const initialResult = hold?.active ? hold.result : "--";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Brazil 2D</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;min-height:100%;background:#fff;font-family:Arial,Helvetica,sans-serif}body{color:#111}.app{width:100%;max-width:480px;min-height:100dvh;margin:0 auto;background:#fff;overflow:hidden}
.live-header{height:58px;padding:8px 18px;display:flex;align-items:center;justify-content:space-between}.brand{font-size:22px;font-weight:900;font-style:italic;white-space:nowrap}.brand-brazil{color:#109447}.brand-2{color:#0864ac}.brand-d{color:#f4be00}.live-pill{background:#e2f5e9;color:#078f40;padding:9px 12px;border-radius:26px;font-size:11px;font-weight:900;white-space:nowrap}.live-dot{display:inline-block;width:10px;height:10px;background:#08a34b;border-radius:50%;margin-right:6px;vertical-align:-1px;animation:pulse 1.3s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.hero{position:relative;height:215px;text-align:center;overflow:hidden;background:radial-gradient(circle at 12% 70%,rgba(16,148,71,.08),transparent 25%),radial-gradient(circle at 88% 68%,rgba(16,148,71,.08),transparent 22%),#fff}.hero:after{content:"";position:absolute;left:-8%;right:-8%;bottom:0;height:56px;background:linear-gradient(168deg,transparent 0 30%,rgba(23,156,79,.5) 31% 52%,rgba(247,205,26,.8) 53% 65%,rgba(16,101,179,.55) 66% 100%);z-index:0}.hero-content{height:100%;position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:36px}
.live-result-box{width:100%;height:126px;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden}.result-digits{display:flex;align-items:center;justify-content:center;line-height:.86;will-change:transform,opacity}.digit{font-size:clamp(110px,31vw,148px);font-weight:900;letter-spacing:-8px}.digit-one{color:#109447}.digit-two{color:#ffc400}.no-result{color:#111;font-size:64px;font-weight:900}.jump-out{animation:jumpOut .28s cubic-bezier(.4,0,.8,.2) forwards}.jump-in{animation:jumpIn .32s cubic-bezier(.2,.8,.2,1) forwards}@keyframes jumpOut{0%{transform:translateY(0) scale(1);opacity:1}100%{transform:translateY(-38px) scale(.96);opacity:0}}@keyframes jumpIn{0%{transform:translateY(38px) scale(.96);opacity:0}100%{transform:translateY(0) scale(1);opacity:1}}
.result-loader{display:none;position:absolute;width:72px;height:72px;border-radius:50%;border:7px solid rgba(70,70,200,.12);border-top-color:#315fd4;border-right-color:#8b42db;border-bottom-color:#315fd4;animation:resultSpin .7s linear infinite}.result-loader.show{display:block}@keyframes resultSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}.date-time{color:#075ea8;font-size:15px;font-weight:900;white-space:nowrap}
.value-card{position:relative;z-index:5;width:calc(100% - 36px);height:76px;margin:-28px auto 12px;background:#fff;border-radius:20px;box-shadow:0 5px 16px rgba(0,0,0,.12);display:flex;align-items:center;padding:8px}.value-item{width:50%;text-align:center;padding:2px 8px}.value-item:first-child{border-right:1px solid #e4e4e4}.value-label{color:#0b9347;font-size:12px;font-weight:900;margin-bottom:5px}.value-number{color:#050505;font-size:21px;font-weight:900;white-space:nowrap}
.round-grid{padding:0 18px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px 10px}.round{height:73px;border:2px solid;border-radius:15px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}.round.green{border-color:#16984d}.round.yellow{border-color:#e8c327}.round.blue{border-color:#176caf}.round-time{font-size:12px;font-weight:900;margin-bottom:4px}.round.green .round-time{color:#109447}.round.yellow .round-time{color:#e8b900}.round.blue .round-time{color:#0762a9}.round-number{color:#0a0a0a;font-size:29px;line-height:1;font-weight:900}
.bottom{padding:11px 18px 38px;position:relative}.history-btn{width:100%;height:48px;border:2px solid #15994c;border-radius:28px;background:#fff;color:#129448;font-size:17px;font-weight:900}.bottom-wave{position:absolute;left:-5%;right:-5%;bottom:0;height:27px;background:linear-gradient(174deg,rgba(20,153,74,.75) 0 25%,#ffdd16 26% 54%,#0965b5 55% 100%)}
@media(max-height:700px){.live-header{height:52px}.hero{height:188px}.live-result-box{height:106px}.digit{font-size:102px}.value-card{height:68px}.round{height:65px}.round-number{font-size:26px}.history-btn{height:43px}}
</style>
</head>
<body>
<div class="app">
<section class="live-header"><div class="brand"><span class="brand-brazil">BRAZIL</span><span class="brand-2"> 2</span><span class="brand-d">D</span></div><div class="live-pill"><span class="live-dot"></span>2D LIVE NOW</div></section>
<section class="hero"><div class="hero-content"><div class="live-result-box"><div class="result-digits" id="resultDigits" ${valid2D(initialResult) ? "" : 'style="display:none"'}><span class="digit digit-one" id="digit1">${valid2D(initialResult) ? initialResult[0] : ""}</span><span class="digit digit-two" id="digit2">${valid2D(initialResult) ? initialResult[1] : ""}</span></div><div class="no-result" id="noResult" ${valid2D(initialResult) ? 'style="display:none"' : ""}>--</div><div class="result-loader" id="resultLoader"></div></div><div class="date-time" id="dateTime">--/--/---- | --:--:-- --</div></div></section>
<section class="value-card"><div class="value-item"><div class="value-label">SET</div><div class="value-number" id="setValue">${hold?.active ? escapeHtml(hold.set) : "--"}</div></div><div class="value-item"><div class="value-label">VALUE</div><div class="value-number" id="valueValue">${hold?.active ? escapeHtml(hold.value) : "--"}</div></div></section>
<section class="round-grid">${ROUNDS.map(r => `<div class="round ${r.color}"><div class="round-time">${r.time}</div><div class="round-number" id="${r.id}">${escapeHtml(state.results[r.id] || "--")}</div></div>`).join("")}</section>
<section class="bottom"><button class="history-btn" onclick="location.href='/history'">2D HISTORY</button><div class="bottom-wave"></div></section>
</div>
<script>
const MARKET_JUMP_MS=${MARKET_JUMP_MS};
let serverBase=${Number(state.serverNow)};
let perfBase=performance.now();
let marketBase=null, marketJumpIndex=0, marketJumpTimer=null, apiTimer=null;
let holdActive=${hold?.active ? "true" : "false"};
let activeHoldRound=${JSON.stringify(hold?.round_time || null)};
let ringBusy=false, loading=false, jumpBusy=false;
function estimatedServerNow(){return serverBase+(performance.now()-perfBase)}
function updateClock(){const now=new Date(estimatedServerNow());const date=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Yangon",day:"2-digit",month:"2-digit",year:"numeric"}).format(now);const time=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Yangon",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true}).format(now);document.getElementById("dateTime").textContent=date+" | "+time}setInterval(updateClock,1000);updateClock();
function format2(v){return Number(v).toFixed(2)}
function makeJumpMarket(base,index){if(!base||!base.ok)return{ok:false,set:"--",value:"--"};const bs=Number(base.set),bv=Number(base.value);if(!Number.isFinite(bs)||!Number.isFinite(bv))return{ok:false,set:"--",value:"--"};const ss=[0,-297.98,-275.79,126.24,-143.67,218.31,-84.52,341.16];const vs=[0,.03,.06,.02,.08,.05,.11,.07];return{ok:true,set:format2(Math.max(0,bs+ss[index%ss.length])),value:format2(bv+vs[index%vs.length])}}
function calculate2D(setValue,valueValue){const sd=String(setValue||"").replace(/\D/g,"");const vi=String(valueValue||"").split(".")[0].replace(/\D/g,"");if(!sd||!vi)return null;return sd.slice(-1)+vi.slice(-1)}
function showBig2D(result){if(!/^\d{2}$/.test(result||""))return;const d=document.getElementById("resultDigits"),n=document.getElementById("noResult");n.style.display="none";d.style.display="flex";document.getElementById("digit1").textContent=result[0];document.getElementById("digit2").textContent=result[1]}
function jumpTo2D(result){if(holdActive||jumpBusy||!/^\d{2}$/.test(result||""))return;const d=document.getElementById("resultDigits");const current=(document.getElementById("digit1").textContent||"")+(document.getElementById("digit2").textContent||"");if(current===result){showBig2D(result);return}jumpBusy=true;d.classList.remove("jump-in","jump-out");void d.offsetWidth;d.classList.add("jump-out");setTimeout(()=>{showBig2D(result);d.classList.remove("jump-out");void d.offsetWidth;d.classList.add("jump-in");setTimeout(()=>{d.classList.remove("jump-in");jumpBusy=false},320)},280)}
function paintLiveMarket(animate=true){if(holdActive||!marketBase||!marketBase.ok)return;const live=makeJumpMarket(marketBase,marketJumpIndex);if(!live.ok)return;document.getElementById("setValue").textContent=live.set;document.getElementById("valueValue").textContent=live.value;const twoD=calculate2D(live.set,live.value);if(twoD){if(animate)jumpTo2D(twoD);else showBig2D(twoD)}}
function startLiveMovement(){if(holdActive)return;paintLiveMarket(false);if(!marketJumpTimer)marketJumpTimer=setInterval(()=>{if(holdActive)return;marketJumpIndex=(marketJumpIndex+1)%100000;paintLiveMarket(true)},MARKET_JUMP_MS)}
function stopLiveMovement(){if(marketJumpTimer){clearInterval(marketJumpTimer);marketJumpTimer=null}jumpBusy=false;const d=document.getElementById("resultDigits");if(d)d.classList.remove("jump-in","jump-out")}
function showFinalWithRing(data){if(ringBusy||!data||!/^\d{2}$/.test(data.result||""))return;ringBusy=true;holdActive=true;stopLiveMovement();const digits=document.getElementById("resultDigits"),no=document.getElementById("noResult"),loader=document.getElementById("resultLoader");no.style.display="none";digits.style.opacity="0";setTimeout(()=>{digits.style.display="none";loader.classList.add("show")},220);setTimeout(()=>{loader.classList.remove("show");document.getElementById("digit1").textContent=data.result[0];document.getElementById("digit2").textContent=data.result[1];digits.style.display="flex";digits.style.opacity="1";document.getElementById("setValue").textContent=data.set||"--";document.getElementById("valueValue").textContent=data.value||"--";activeHoldRound=data.round_time;ringBusy=false},1200)}
function updateRoundCards(results){if(!results)return;["r1100","r1300","r1500","r1700","r1900","r2100"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=results[id]||"--"})}
function renderState(data){if(!data)return;serverBase=Number(data.serverNow)||Date.now();perfBase=performance.now();marketBase=data.market&&data.market.ok?data.market:null;updateRoundCards(data.results);const newHold=Boolean(data.resultHold&&data.resultHold.active);if(newHold){const h=data.resultHold;if(!holdActive||activeHoldRound!==h.round_time)showFinalWithRing(h);else{holdActive=true;stopLiveMovement();showBig2D(h.result);document.getElementById("setValue").textContent=h.set||"--";document.getElementById("valueValue").textContent=h.value||"--"}return}if(holdActive&&!newHold){holdActive=false;activeHoldRound=null;marketJumpIndex=0;startLiveMovement();return}holdActive=false;startLiveMovement()}
async function loadLive(){if(loading)return;loading=true;try{const r=await fetch("/api/live?t="+Date.now(),{cache:"no-store"});const data=await r.json();if(!r.ok||!data.success)throw new Error("Live API error");renderState(data)}catch(e){console.error(e)}finally{loading=false}}
loadLive();apiTimer=setInterval(()=>{if(document.visibilityState==="visible")loadLive()},2000);window.addEventListener("focus",loadLive);window.addEventListener("online",loadLive);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")loadLive()});
</script>
</body>
</html>`;
}

// ============================================================
// ADMIN LOGIN PAGE
// ============================================================

function adminLoginPage(message = "") {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brazil 2D Admin</title><style>*{box-sizing:border-box}body{margin:0;background:#f0f5f2;font-family:Arial}.page{max-width:480px;min-height:100vh;margin:auto;display:flex;align-items:center;justify-content:center;padding:25px}.card{width:100%;background:#fff;border-radius:25px;padding:32px 24px;box-shadow:0 8px 30px rgba(0,0,0,.1)}.logo{text-align:center;color:#109447;font-size:27px;font-weight:900;margin-bottom:8px}.sub{text-align:center;color:#777;margin-bottom:28px}.message{text-align:center;color:#d92727;font-weight:800;margin-bottom:18px}label{display:block;font-weight:800;margin-bottom:8px}input{width:100%;height:52px;border:1px solid #ccc;border-radius:12px;padding:0 14px;font-size:17px}button{width:100%;height:54px;border:0;border-radius:14px;margin-top:20px;background:#109447;color:#fff;font-size:18px;font-weight:900}.home{display:block;text-align:center;margin-top:20px;color:#0762a9;text-decoration:none;font-weight:800}</style></head><body><div class="page"><div class="card"><div class="logo">BRAZIL 2D 🇧🇷</div><div class="sub">ADMIN LOGIN</div>${message ? `<div class="message">${escapeHtml(message)}</div>` : ""}<form method="POST" action="/admin/login"><label>Password</label><input type="password" name="password" required autocomplete="current-password"><button type="submit">LOGIN</button></form><a href="/" class="home">← Back to Brazil 2D</a></div></div></body></html>`;
}

// ============================================================
// ADMIN PAGE
// Each round has SET, VALUE, Auto 2D, manual override,
// Auto Publish, Save Schedule, Publish Now, Undo Publish
// ============================================================

async function adminPage(DB, requestedDate, message = "") {
  const today = getMyanmarDate();
  const selectedDate = validDate(requestedDate) ? requestedDate : today;
  const rows = await getDayRows(DB, selectedDate);
  const controls = await getPublishRows(DB, selectedDate);
  const rowMap = new Map(rows.map(r => [r.round_time, r]));
  const ctrlMap = new Map(controls.map(r => [r.round_time, r]));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brazil 2D Admin</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f3f6f4}.admin{width:100%;max-width:560px;margin:auto;min-height:100vh;background:#fff}.header{background:#109447;color:#fff;padding:20px;text-align:center;font-size:23px;font-weight:900}.content{padding:18px}.notice{padding:11px 13px;border-radius:10px;background:#eef9f1;color:#0d7d3d;font-weight:800;margin-bottom:14px}.date-row{display:flex;gap:10px;align-items:end}.date-row>div{flex:1}label{display:block;font-weight:800;color:#333;margin:10px 0 6px}input{width:100%;height:45px;padding:0 12px;border:1px solid #ccc;border-radius:10px;font-size:16px}.round-card{border:1px solid #ddd;border-radius:18px;padding:14px;margin:14px 0;box-shadow:0 3px 12px rgba(0,0,0,.05)}.round-title{font-size:18px;font-weight:900;color:#109447;margin-bottom:10px}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px}.auto-result{height:50px;font-size:26px;font-weight:900;text-align:center;color:#109447;background:#f3fff7}.manual-result{font-size:22px;font-weight:900;text-align:center}.switch-row{display:flex;align-items:center;gap:8px;margin-top:12px;font-weight:800}.switch-row input{width:20px;height:20px}.buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.buttons button{height:44px;border:0;border-radius:10px;color:#fff;font-weight:900;font-size:14px}.save{background:#109447}.publish{background:#176caf}.undo{background:#c62828}.full{grid-column:1/-1}.links{display:flex;gap:10px;margin-top:18px}.links a{flex:1;text-align:center;padding:13px;border-radius:10px;text-decoration:none;font-weight:800}.home{color:#0762a9;background:#edf6fc}.logout{color:#c62828;background:#fff0f0}.hint{font-size:12px;color:#777;margin-top:5px;line-height:1.4}.old-history{margin-top:28px;padding-top:20px;border-top:3px solid #e6edf3}.old-title{font-size:24px;font-weight:900;color:#176caf;margin-bottom:12px}.old-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.old-card{background:#f5f8fc;border-radius:14px;padding:12px}.old-card label{text-align:center;margin:0 0 8px;color:#111}.old-card input{text-align:center;font-size:24px;font-weight:900}.old-save{width:100%;height:52px;border:0;border-radius:12px;background:#f28a00;color:#fff;font-size:17px;font-weight:900;margin-top:14px}@media(max-width:420px){.two-col{grid-template-columns:1fr}.buttons{grid-template-columns:1fr}.full{grid-column:auto}.old-grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body><div class="admin"><div class="header">BRAZIL 2D ADMIN 🇧🇷</div><div class="content">
${message ? `<div class="notice">${escapeHtml(message)}</div>` : ""}
<div class="date-row"><div><label>Result Date</label><input type="date" id="resultDate" value="${escapeHtml(selectedDate)}" onchange="loadDate()"></div></div>
<div class="hint">SET + VALUE ရိုက်တာနဲ့ Auto 2D Result ချက်ချင်းတွက်ပေးမယ်။ Manual Result ကို မရေးထားရင် Auto 2D ကို Save Schedule မှာသုံးမယ်။</div>
${ROUNDS.map(round => {
  const row = rowMap.get(round.time) || {};
  const ctrl = ctrlMap.get(round.time) || { auto_publish: 1, manual_publish: 0, suppressed: 0 };
  const auto = calculate2D(row.set_value || "", row.market_value || "");
  return `
  <div class="round-card" data-round="${round.field}">
    <div class="round-title">${round.time}</div>
    <form method="POST" action="/admin/save-schedule" class="schedule-form">
      <input type="hidden" name="result_date" value="${escapeHtml(selectedDate)}">
      <input type="hidden" name="round_time" value="${round.time}">
      <div class="two-col">
        <div><label>SET</label><input class="set-input" type="text" name="set_value" value="${escapeHtml(row.set_value || "")}" placeholder="Example: 3456.78"></div>
        <div><label>VALUE</label><input class="value-input" type="text" name="market_value" value="${escapeHtml(row.market_value || "")}" placeholder="Example: 67890.88"></div>
      </div>
      <label>AUTO 2D RESULT</label><input class="auto-result" type="text" value="${escapeHtml(auto || "--")}" readonly>
      <label>MANUAL RESULT (optional)</label><input class="manual-result" type="text" name="manual_result" value="${valid2D(row.result) ? escapeHtml(row.result) : ""}" maxlength="2" inputmode="numeric" placeholder="Auto result ကိုသုံးမယ်ဆို အလွတ်ထားပါ">
      <div class="switch-row"><input type="checkbox" name="auto_publish" value="1" ${Number(ctrl.auto_publish) === 1 ? "checked" : ""}><span>Auto Publish</span></div>
      <div class="buttons"><button class="save full" type="submit">SAVE SCHEDULE</button></div>
    </form>
    <div class="buttons">
      <form method="POST" action="/admin/publish-now"><input type="hidden" name="result_date" value="${escapeHtml(selectedDate)}"><input type="hidden" name="round_time" value="${round.time}"><button class="publish" type="submit">PUBLISH NOW</button></form>
      <form method="POST" action="/admin/undo-publish"><input type="hidden" name="result_date" value="${escapeHtml(selectedDate)}"><input type="hidden" name="round_time" value="${round.time}"><button class="undo" type="submit">UNDO PUBLISH</button></form>
    </div>
  </div>`;
}).join("")}
<div class="old-history">
  <div class="old-title">Add Old History</div>
  <form method="POST" action="/admin/save-old-history">
    <label>History Date</label>
    <input type="date" name="history_date" required>
    <div class="old-grid">
      ${ROUNDS.map(round => `
      <div class="old-card">
        <label>${round.time}</label>
        <input type="text" name="old_${round.id}" maxlength="2" inputmode="numeric" placeholder="--">
      </div>`).join("")}
    </div>
    <button class="old-save" type="submit">Save Old History</button>
  </form>
  <div class="hint">အရင်နေ့ရက်ကိုရွေးပြီး သိမ်းချင်တဲ့ 2D Result တွေကို ထည့်ပါ။ 11:00 AM မှ 09:00 PM အထိ 6 ကြိမ်ပဲ ပါမယ်။</div>
</div>
<div class="links"><a class="home" href="/">Main Page</a><a class="logout" href="/admin/logout">Logout</a></div>
</div></div>
<script>
function loadDate(){const d=document.getElementById("resultDate").value;if(d)location.href="/admin?date="+encodeURIComponent(d)}
function calc2D(setValue,valueValue){const sd=String(setValue||"").replace(/\D/g,"");const vi=String(valueValue||"").split(".")[0].replace(/\D/g,"");if(!sd||!vi)return "";return sd.slice(-1)+vi.slice(-1)}
document.querySelectorAll(".round-card").forEach(card=>{const s=card.querySelector(".set-input"),v=card.querySelector(".value-input"),a=card.querySelector(".auto-result");const update=()=>{a.value=calc2D(s.value,v.value)||"--"};s.addEventListener("input",update);v.addEventListener("input",update);update()});
</script>
</body></html>`;
}

// ============================================================
// ADMIN ACTIONS
// ============================================================

async function saveSchedule(request, env) {
  const form = await request.formData();
  const resultDate = String(form.get("result_date") || "").trim();
  const roundTime = String(form.get("round_time") || "").trim();
  const setValue = String(form.get("set_value") || "").trim();
  const marketValue = String(form.get("market_value") || "").trim();
  const manualResult = String(form.get("manual_result") || "").trim();
  const autoPublish = form.get("auto_publish") ? 1 : 0;

  if (!validDate(resultDate)) return new Response("Invalid date", { status: 400 });
  if (!ROUNDS.some(r => r.time === roundTime)) return new Response("Invalid round", { status: 400 });

  const autoResult = calculate2D(setValue, marketValue);
  const finalResult = manualResult || autoResult;
  if (!valid2D(finalResult)) return new Response("SET/VALUE ကနေ 2D မတွက်နိုင်သေးပါ။ Manual Result 2 လုံးထည့်ပါ။", { status: 400 });

  await env.DB.prepare(`
    INSERT INTO results (result_date, round_time, result, set_value, market_value, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(result_date, round_time) DO UPDATE SET
      result = excluded.result,
      set_value = excluded.set_value,
      market_value = excluded.market_value,
      updated_at = CURRENT_TIMESTAMP
  `).bind(resultDate, roundTime, finalResult, setValue || null, marketValue || null).run();

  await env.DB.prepare(`
    INSERT INTO publish_controls (result_date, round_time, auto_publish, manual_publish, suppressed, published_at, updated_at)
    VALUES (?, ?, ?, 0, 0, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(result_date, round_time) DO UPDATE SET
      auto_publish = excluded.auto_publish,
      manual_publish = 0,
      suppressed = 0,
      published_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).bind(resultDate, roundTime, autoPublish).run();

  return adminRedirect(request, resultDate, "Schedule saved: " + roundTime + " → " + finalResult);
}

async function publishNow(request, env) {
  const form = await request.formData();
  const resultDate = String(form.get("result_date") || "").trim();
  const roundTime = String(form.get("round_time") || "").trim();
  if (!validDate(resultDate) || !ROUNDS.some(r => r.time === roundTime)) return new Response("Invalid request", { status: 400 });

  const row = await env.DB.prepare(`SELECT result FROM results WHERE result_date=? AND round_time=? LIMIT 1`).bind(resultDate, roundTime).first();
  if (!row || !valid2D(row.result)) return new Response("ဒီ Round မှာ Save Schedule မလုပ်ရသေးပါ။", { status: 400 });

  await env.DB.prepare(`
    INSERT INTO publish_controls (result_date, round_time, auto_publish, manual_publish, suppressed, published_at, updated_at)
    VALUES (?, ?, 1, 1, 0, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(result_date, round_time) DO UPDATE SET
      manual_publish = 1,
      suppressed = 0,
      published_at = excluded.published_at,
      updated_at = CURRENT_TIMESTAMP
  `).bind(resultDate, roundTime, Math.floor(Date.now() / 1000)).run();

  return adminRedirect(request, resultDate, "Published now: " + roundTime + " → " + row.result);
}

async function undoPublish(request, env) {
  const form = await request.formData();
  const resultDate = String(form.get("result_date") || "").trim();
  const roundTime = String(form.get("round_time") || "").trim();
  if (!validDate(resultDate) || !ROUNDS.some(r => r.time === roundTime)) return new Response("Invalid request", { status: 400 });

  await env.DB.prepare(`
    INSERT INTO publish_controls (result_date, round_time, auto_publish, manual_publish, suppressed, published_at, updated_at)
    VALUES (?, ?, 0, 0, 1, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(result_date, round_time) DO UPDATE SET
      manual_publish = 0,
      suppressed = 1,
      published_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).bind(resultDate, roundTime).run();

  return adminRedirect(request, resultDate, "Publish undone: " + roundTime);
}

async function saveOldHistory(request, env) {
  const form = await request.formData();
  const historyDate = String(form.get("history_date") || "").trim();
  if (!validDate(historyDate)) return new Response("Invalid history date", { status: 400 });
  if (historyDate >= getMyanmarDate()) return new Response("Old History အတွက် ဒီနေ့မတိုင်ခင် ရက်စွဲကို ရွေးပါ။", { status: 400, headers: { "Content-Type": "text/plain; charset=UTF-8" } });

  let saved = 0;
  for (const round of ROUNDS) {
    const value = String(form.get("old_" + round.id) || "").trim();
    if (!value) continue;
    if (!valid2D(value)) return new Response(round.time + " Result ကို 2 လုံးတိတိထည့်ပါ။", { status: 400, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
    await env.DB.prepare(`
      INSERT INTO results (result_date, round_time, result, set_value, market_value, updated_at)
      VALUES (?, ?, ?, NULL, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(result_date, round_time) DO UPDATE SET
        result = excluded.result,
        updated_at = CURRENT_TIMESTAMP
    `).bind(historyDate, round.time, value).run();
    saved++;
  }

  if (!saved) return new Response("History Result အနည်းဆုံးတစ်ခု ထည့်ပါ။", { status: 400, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  return adminRedirect(request, getMyanmarDate(), `Old History သိမ်းပြီးပါပြီ — ${historyDate} (${saved} results)`);
}

function adminRedirect(request, date, msg) {
  const u = new URL("/admin", request.url);
  u.searchParams.set("date", date);
  u.searchParams.set("msg", msg);
  return Response.redirect(u.toString(), 303);
}

// ============================================================
// HISTORY — Date + 6 Results only
// ============================================================

async function historyPage(DB) {
  const query = await DB.prepare(`
    SELECT result_date, round_time, result
    FROM results
    ORDER BY result_date DESC,
      CASE round_time
        WHEN '11:00 AM' THEN 1 WHEN '01:00 PM' THEN 2 WHEN '03:00 PM' THEN 3
        WHEN '05:00 PM' THEN 4 WHEN '07:00 PM' THEN 5 WHEN '09:00 PM' THEN 6 ELSE 99
      END
  `).all();

  const grouped = {};
  for (const row of query.results || []) {
    if (!grouped[row.result_date]) grouped[row.result_date] = {};
    if (valid2D(row.result)) grouped[row.result_date][row.round_time] = row.result;
  }

  const cards = Object.keys(grouped).map(date => `<div class="day"><div class="date">${escapeHtml(date)}</div><div class="rounds">${ROUNDS.map(r => `<div class="round ${r.color}"><div class="time">${r.time}</div><div class="number">${escapeHtml(grouped[date][r.time] || "--")}</div></div>`).join("")}</div></div>`).join("");

  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brazil 2D History</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#f2f6f3;color:#111}.page{max-width:480px;min-height:100vh;margin:auto;background:#fff}.header{background:#109447;color:#fff;min-height:66px;display:flex;align-items:center;padding:0 18px}.back{font-size:34px;margin-right:15px;cursor:pointer}.title{font-size:20px;font-weight:900}.content{padding:16px}.day{margin-bottom:20px;background:#fff;border-radius:18px;box-shadow:0 4px 16px rgba(0,0,0,.08);padding:15px}.date{color:#0864ac;font-size:19px;font-weight:900;margin-bottom:14px}.rounds{display:grid;grid-template-columns:1fr 1fr;gap:8px}.round{border:1.5px solid;border-radius:12px;padding:10px;text-align:center;background:#fff}.round.green{border-color:#109447}.round.yellow{border-color:#e8c327}.round.blue{border-color:#176caf}.time{font-size:12px;font-weight:800;margin-bottom:5px}.round.green .time{color:#109447}.round.yellow .time{color:#e8b900}.round.blue .time{color:#0762a9}.number{font-size:27px;font-weight:900}.empty{text-align:center;color:#999;padding:80px 20px}</style></head><body><div class="page"><div class="header"><div class="back" onclick="location.href='/'">‹</div><div class="title">BRAZIL 2D HISTORY 🇧🇷</div></div><div class="content">${cards || '<div class="empty">No history data yet.</div>'}</div></div></body></html>`;
}
