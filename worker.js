export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // =========================
      // MAIN PAGE
      // =========================
      if (url.pathname === "/" && request.method === "GET") {
        return html(await mainPage(env.DB));
      }

      // =========================
      // LIVE API
      // =========================
      if (url.pathname === "/api/today" && request.method === "GET") {
        const data = await getTodayData(env.DB);

        return new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "Cache-Control": "no-store, no-cache, must-revalidate"
          }
        });
      }

      // =========================
      // HISTORY
      // =========================
      if (url.pathname === "/history" && request.method === "GET") {
        return html(await historyPage(env.DB));
      }

      // =========================
      // ADMIN
      // =========================
      if (url.pathname === "/admin" && request.method === "GET") {
        const loggedIn = await isAdmin(request, env);

        if (!loggedIn) {
          return html(adminLoginPage());
        }

        return html(await adminPage(env.DB));
      }

      // =========================
      // ADMIN LOGIN
      // =========================
      if (url.pathname === "/admin/login" && request.method === "POST") {
        return await adminLogin(request, env);
      }

      // =========================
      // ADMIN LOGOUT
      // =========================
      if (url.pathname === "/admin/logout") {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/admin",
            "Set-Cookie":
              "brazil_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
          }
        });
      }

      // =========================
      // SAVE RESULTS
      // =========================
      if (url.pathname === "/admin/save" && request.method === "POST") {
        const loggedIn = await isAdmin(request, env);

        if (!loggedIn) {
          return Response.redirect(
            new URL("/admin", request.url).toString(),
            303
          );
        }

        return await saveResults(request, env);
      }

      return new Response("Not Found", {
        status: 404
      });

    } catch (error) {
      return new Response(
        "Brazil 2D Error: " + error.message,
        {
          status: 500,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8"
          }
        }
      );
    }
  }
};


// ============================================================
// ROUND SETTINGS
// ============================================================

const ROUNDS = [
  {
    time: "11:00 AM",
    minutes: 11 * 60,
    color: "green",
    field: "r1100",
    id: "r1100"
  },
  {
    time: "01:00 PM",
    minutes: 13 * 60,
    color: "yellow",
    field: "r1300",
    id: "r1300"
  },
  {
    time: "03:00 PM",
    minutes: 15 * 60,
    color: "blue",
    field: "r1500",
    id: "r1500"
  },
  {
    time: "05:00 PM",
    minutes: 17 * 60,
    color: "green",
    field: "r1700",
    id: "r1700"
  },
  {
    time: "07:00 PM",
    minutes: 19 * 60,
    color: "yellow",
    field: "r1900",
    id: "r1900"
  },
  {
    time: "09:00 PM",
    minutes: 21 * 60,
    color: "blue",
    field: "r2100",
    id: "r2100"
  }
];


// ============================================================
// BASIC HELPERS
// ============================================================

function html(content, status = 200, extraHeaders = {}) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      ...extraHeaders
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


function pad2(number) {
  return String(number).padStart(2, "0");
}


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

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}


function getMyanmarDate() {
  const p = getYangonParts();

  return (
    p.year +
    "-" +
    pad2(p.month) +
    "-" +
    pad2(p.day)
  );
}


function getCurrentMinutes() {
  const p = getYangonParts();

  return (
    p.hour * 60 +
    p.minute
  );
}


function valid2D(value) {
  return /^[0-9]{2}$/.test(
    String(value || "")
  );
}


// ============================================================
// ADMIN SESSION
// ============================================================

async function createSignature(value, secret) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  );

  return arrayBufferToBase64Url(signature);
}


function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}


function getCookie(request, name) {
  const cookie =
    request.headers.get("Cookie") || "";

  const pieces =
    cookie.split(";");

  for (const piece of pieces) {
    const [key, ...rest] =
      piece.trim().split("=");

    if (key === name) {
      return rest.join("=");
    }
  }

  return "";
}


async function createAdminToken(secret) {
  const expires =
    Date.now() +
    12 * 60 * 60 * 1000;

  const data =
    String(expires);

  const signature =
    await createSignature(
      data,
      secret
    );

  return (
    data +
    "." +
    signature
  );
}


async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return false;
  }

  const token =
    getCookie(
      request,
      "brazil_admin"
    );

  if (!token) {
    return false;
  }

  const pieces =
    token.split(".");

  if (pieces.length !== 2) {
    return false;
  }

  const expires =
    pieces[0];

  const signature =
    pieces[1];

  if (
    Number(expires) <
    Date.now()
  ) {
    return false;
  }

  const expected =
    await createSignature(
      expires,
      env.ADMIN_PASSWORD
    );

  return (
    signature ===
    expected
  );
}


async function adminLogin(request, env) {
  const form =
    await request.formData();

  const password =
    String(
      form.get("password") || ""
    );

  if (
    !env.ADMIN_PASSWORD ||
    password !== env.ADMIN_PASSWORD
  ) {
    return html(
      adminLoginPage(
        "Wrong password."
      ),
      401
    );
  }

  const token =
    await createAdminToken(
      env.ADMIN_PASSWORD
    );

  return new Response(null, {
    status: 303,
    headers: {
      Location:
        new URL(
          "/admin",
          request.url
        ).toString(),

      "Set-Cookie":
        "brazil_admin=" +
        token +
        "; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict"
    }
  });
}


// ============================================================
// GET TODAY DATA
// ============================================================

async function getTodayData(DB) {
  const today =
    getMyanmarDate();

  const currentMinutes =
    getCurrentMinutes();

  const query =
    await DB.prepare(`
      SELECT
        round_time,
        result,
        set_value,
        market_value
      FROM results
      WHERE result_date = ?
    `)
    .bind(today)
    .all();

  const rows =
    query.results || [];

  const databaseMap = {};

  let setValue = "--";
  let marketValue = "--";

  for (const row of rows) {
    databaseMap[row.round_time] =
      row;

    if (row.set_value) {
      setValue =
        row.set_value;
    }

    if (row.market_value) {
      marketValue =
        row.market_value;
    }
  }


  const results = {};

  let liveResult = "--";


  for (const round of ROUNDS) {
    const row =
      databaseMap[round.time];

    const reached =
      currentMinutes >=
      round.minutes;

    if (
      reached &&
      row &&
      valid2D(row.result)
    ) {
      results[round.id] =
        row.result;

      liveResult =
        row.result;
    } else {
      results[round.id] =
        "--";
    }
  }


  return {
    date: today,
    set: setValue,
    value: marketValue,
    live: liveResult,
    results
  };
}


// ============================================================
// MAIN PAGE
// ============================================================

async function mainPage(DB) {
  const data =
    await getTodayData(DB);

  let firstDigit = "-";
  let secondDigit = "-";

  if (valid2D(data.live)) {
    firstDigit =
      data.live.charAt(0);

    secondDigit =
      data.live.charAt(1);
  }

  return `<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0, maximum-scale=1.0">

<title>Brazil 2D</title>

<style>

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  width: 100%;
  min-height: 100%;
  background: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
}

body {
  color: #111;
}

.app {
  width: 100%;
  max-width: 480px;
  min-height: 100dvh;
  margin: 0 auto;
  background: #fff;
  position: relative;
  overflow: hidden;
}


/* =========================
   LIVE HEADER
========================= */

.live-header {
  height: 58px;
  padding: 8px 18px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  background: #fff;
}

.brand {
  font-size: 22px;
  font-weight: 900;
  font-style: italic;
  white-space: nowrap;
}

.brand-brazil {
  color: #109447;
}

.brand-2 {
  color: #0864ac;
}

.brand-d {
  color: #f4be00;
}

.live-pill {
  background: #e2f5e9;
  color: #078f40;

  padding: 9px 12px;

  border-radius: 26px;

  font-size: 11px;
  font-weight: 900;

  white-space: nowrap;
}

.live-dot {
  display: inline-block;

  width: 10px;
  height: 10px;

  background: #08a34b;

  border-radius: 50%;

  margin-right: 6px;

  vertical-align: -1px;

  animation:
    pulse
    1.3s
    infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: .35;
  }
}


/* =========================
   HERO
========================= */

.hero {
  position: relative;

  height: 215px;

  text-align: center;

  overflow: hidden;

  background:
    radial-gradient(
      circle at 12% 70%,
      rgba(16,148,71,.08),
      transparent 25%
    ),
    radial-gradient(
      circle at 88% 68%,
      rgba(16,148,71,.08),
      transparent 22%
    ),
    #fff;
}

.hero::after {
  content: "";

  position: absolute;

  left: -8%;
  right: -8%;
  bottom: 0;

  height: 56px;

  background:
    linear-gradient(
      168deg,
      transparent 0 30%,
      rgba(23,156,79,.50) 31% 52%,
      rgba(247,205,26,.80) 53% 65%,
      rgba(16,101,179,.55) 66% 100%
    );

  z-index: 0;
}

.hero-content {
  height: 100%;

  position: relative;

  z-index: 2;

  display: flex;

  flex-direction: column;

  align-items: center;

  justify-content: center;

  padding-bottom: 38px;
}


/* =========================
   BIG LIVE RESULT
========================= */

.live-result-box {
  width: 100%;
  height: 125px;

  display: flex;

  align-items: center;

  justify-content: center;

  position: relative;
}

.result-digits {
  display: flex;

  align-items: center;

  justify-content: center;

  line-height: .85;

  transition:
    opacity .22s ease,
    transform .22s ease;
}

.result-digits.hide {
  opacity: 0;
  transform: scale(.82);
}

.digit {
  font-size: clamp(
    105px,
    30vw,
    145px
  );

  font-weight: 900;

  letter-spacing: -8px;
}

.digit-one {
  color: #119447;
}

.digit-two {
  color: #ffc400;
}


/* LOADING RING */

.result-loader {
  display: none;

  position: absolute;

  width: 72px;
  height: 72px;

  border-radius: 50%;

  border:
    7px solid
    rgba(63,81,181,.15);

  border-top-color:
    #315fd4;

  border-right-color:
    #7b42d8;

  border-bottom-color:
    #315fd4;

  animation:
    resultSpin
    .75s
    linear
    infinite;
}

.result-loader.show {
  display: block;
}

@keyframes resultSpin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}


.date-time {
  color: #075ea8;

  font-size: 15px;

  font-weight: 900;

  letter-spacing: .3px;

  white-space: nowrap;
}


/* =========================
   SET / VALUE CARD
========================= */

.value-card {
  position: relative;

  z-index: 5;

  width:
    calc(100% - 36px);

  height: 76px;

  margin:
    -28px
    auto
    12px;

  background: #fff;

  border-radius: 20px;

  box-shadow:
    0
    5px
    16px
    rgba(0,0,0,.12);

  display: flex;

  align-items: center;

  padding: 8px;
}

.value-item {
  width: 50%;

  text-align: center;

  padding: 2px 8px;
}

.value-item:first-child {
  border-right:
    1px solid
    #e4e4e4;
}

.value-label {
  color: #0b9347;

  font-size: 12px;

  font-weight: 900;

  margin-bottom: 5px;
}

.value-number {
  color: #050505;

  font-size: 21px;

  font-weight: 900;

  white-space: nowrap;
}


/* =========================
   6 ROUNDS
========================= */

.round-grid {
  padding: 0 18px;

  display: grid;

  grid-template-columns:
    repeat(2, 1fr);

  gap: 8px 10px;
}

.round {
  height: 73px;

  border:
    2px solid;

  border-radius: 15px;

  background: #fff;

  display: flex;

  flex-direction: column;

  align-items: center;

  justify-content: center;
}

.round.green {
  border-color: #16984d;
}

.round.yellow {
  border-color: #e8c327;
}

.round.blue {
  border-color: #176caf;
}

.round-time {
  font-size: 12px;

  font-weight: 900;

  margin-bottom: 4px;
}

.round.green .round-time {
  color: #109447;
}

.round.yellow .round-time {
  color: #e8b900;
}

.round.blue .round-time {
  color: #0762a9;
}

.round-number {
  color: #0a0a0a;

  font-size: 29px;

  line-height: 1;

  font-weight: 900;
}


/* =========================
   HISTORY BUTTON
========================= */

.bottom {
  padding:
    11px
    18px
    38px;

  position: relative;
}

.history-btn {
  width: 100%;

  height: 48px;

  border:
    2px solid
    #15994c;

  border-radius: 28px;

  background: #fff;

  color: #129448;

  font-size: 17px;

  font-weight: 900;

  cursor: pointer;
}

.bottom-wave {
  position: absolute;

  left: -5%;
  right: -5%;
  bottom: 0;

  height: 27px;

  background:
    linear-gradient(
      174deg,
      rgba(20,153,74,.75) 0 25%,
      #ffdd16 26% 54%,
      #0965b5 55% 100%
    );
}


/* SMALL PHONE */

@media (max-height: 700px) {

  .live-header {
    height: 52px;
  }

  .hero {
    height: 190px;
  }

  .live-result-box {
    height: 108px;
  }

  .digit {
    font-size: 102px;
  }

  .value-card {
    height: 68px;
  }

  .round {
    height: 66px;
  }

  .round-number {
    font-size: 26px;
  }

  .history-btn {
    height: 44px;
  }
}

</style>

</head>


<body>

<div class="app">


<section class="live-header">

  <div class="brand">

    <span class="brand-brazil">
      BRAZIL
    </span>

    <span class="brand-2">
      2
    </span>

    <span class="brand-d">
      D
    </span>

  </div>


  <div class="live-pill">

    <span class="live-dot"></span>

    2D LIVE NOW

  </div>

</section>


<section class="hero">

  <div class="hero-content">


    <div class="live-result-box">


      <div
        class="result-digits"
        id="resultDigits"
      >

        <span
          class="digit digit-one"
          id="digit1"
        >
          ${escapeHtml(firstDigit)}
        </span>

        <span
          class="digit digit-two"
          id="digit2"
        >
          ${escapeHtml(secondDigit)}
        </span>

      </div>


      <div
        class="result-loader"
        id="resultLoader"
      ></div>


    </div>


    <div
      class="date-time"
      id="dateTime"
    >
      --/--/---- | --:--:-- --
    </div>


  </div>

</section>


<section class="value-card">


  <div class="value-item">

    <div class="value-label">
      SET
    </div>

    <div
      class="value-number"
      id="setValue"
    >
      ${escapeHtml(data.set)}
    </div>

  </div>


  <div class="value-item">

    <div class="value-label">
      VALUE
    </div>

    <div
      class="value-number"
      id="marketValue"
    >
      ${escapeHtml(data.value)}
    </div>

  </div>


</section>


<section class="round-grid">


${ROUNDS.map(round => `

<div class="round ${round.color}">

  <div class="round-time">
    ${round.time}
  </div>

  <div
    class="round-number"
    id="${round.id}"
  >
    ${escapeHtml(
      data.results[round.id] || "--"
    )}
  </div>

</div>

`).join("")}


</section>


<section class="bottom">

  <button
    class="history-btn"
    onclick="window.location.href='/history'"
  >
    2D HISTORY
  </button>

  <div class="bottom-wave"></div>

</section>


</div>


<script>

let currentLive =
  ${JSON.stringify(data.live)};

let animationRunning = false;


/* CLOCK */

function updateClock() {

  const now =
    new Date();

  const date =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Asia/Yangon",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    ).format(now);

  const time =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "Asia/Yangon",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }
    ).format(now);

  document
    .getElementById("dateTime")
    .textContent =
      date +
      " | " +
      time;
}


updateClock();

setInterval(
  updateClock,
  1000
);


/* LARGE RESULT ANIMATION */

function animateLiveResult(nextResult) {

  if (animationRunning) {
    return;
  }

  if (
    !nextResult ||
    nextResult === "--" ||
    nextResult.length !== 2
  ) {
    return;
  }

  if (
    nextResult === currentLive
  ) {
    return;
  }

  animationRunning = true;

  const digits =
    document.getElementById(
      "resultDigits"
    );

  const loader =
    document.getElementById(
      "resultLoader"
    );


  /* OLD NUMBER DISAPPEARS */

  digits.classList.add(
    "hide"
  );


  setTimeout(
    function() {

      digits.style.display =
        "none";

      loader.classList.add(
        "show"
      );

    },
    220
  );


  /* RING SPINS */

  setTimeout(
    function() {

      loader.classList.remove(
        "show"
      );

      document
        .getElementById("digit1")
        .textContent =
          nextResult.charAt(0);

      document
        .getElementById("digit2")
        .textContent =
          nextResult.charAt(1);

      digits.style.display =
        "flex";

      requestAnimationFrame(
        function() {

          digits.classList.remove(
            "hide"
          );

        }
      );

      currentLive =
        nextResult;

      animationRunning =
        false;

    },
    1200
  );
}


/* AUTO UPDATE */

async function refreshBrazil2D() {

  try {

    const response =
      await fetch(
        "/api/today?time=" +
        Date.now(),
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      return;
    }

    const data =
      await response.json();


    /* SET / VALUE */

    document
      .getElementById("setValue")
      .textContent =
        data.set || "--";

    document
      .getElementById("marketValue")
      .textContent =
        data.value || "--";


    /* ROUND RESULTS */

    const ids = [
      "r1100",
      "r1300",
      "r1500",
      "r1700",
      "r1900",
      "r2100"
    ];

    for (const id of ids) {

      const el =
        document.getElementById(id);

      if (
        el &&
        data.results
      ) {
        el.textContent =
          data.results[id] ||
          "--";
      }

    }


    /* BIG RESULT */

    if (
      data.live &&
      data.live !== "--" &&
      data.live !== currentLive
    ) {

      animateLiveResult(
        data.live
      );

    }

  } catch (error) {
    console.log(
      "Refresh error",
      error
    );
  }

}


/* CHECK EVERY 5 SECONDS */

setInterval(
  refreshBrazil2D,
  5000
);

</script>

</body>
</html>`;
}


// ============================================================
// ADMIN LOGIN PAGE
// ============================================================

function adminLoginPage(message = "") {
  return `<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Brazil 2D Admin</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f0f5f2;
  font-family: Arial, Helvetica, sans-serif;
}

.page {
  width: 100%;
  max-width: 480px;
  min-height: 100vh;
  margin: auto;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 25px;
}

.card {
  width: 100%;

  background: #fff;

  border-radius: 25px;

  padding: 32px 24px;

  box-shadow:
    0 8px 30px
    rgba(0,0,0,.10);
}

.logo {
  text-align: center;
  color: #109447;
  font-size: 27px;
  font-weight: 900;
  margin-bottom: 8px;
}

.sub {
  text-align: center;
  color: #777;
  margin-bottom: 28px;
}

.message {
  text-align: center;
  color: #d92727;
  font-weight: 800;
  margin-bottom: 18px;
}

label {
  display: block;
  font-weight: 800;
  margin-bottom: 8px;
}

input {
  width: 100%;
  height: 52px;

  border:
    1px solid #ccc;

  border-radius: 12px;

  padding: 0 14px;

  font-size: 17px;
}

button {
  width: 100%;
  height: 54px;

  border: 0;

  border-radius: 14px;

  margin-top: 20px;

  background: #109447;

  color: #fff;

  font-size: 18px;

  font-weight: 900;
}

.home {
  display: block;

  text-align: center;

  margin-top: 20px;

  color: #0762a9;

  text-decoration: none;

  font-weight: 800;
}

</style>

</head>

<body>

<div class="page">

<div class="card">

<div class="logo">
  BRAZIL 2D 🇧🇷
</div>

<div class="sub">
  ADMIN LOGIN
</div>

${
  message
    ? `<div class="message">${escapeHtml(message)}</div>`
    : ""
}

<form
  method="POST"
  action="/admin/login"
>

<label>
  Password
</label>

<input
  type="password"
  name="password"
  required
  autocomplete="current-password"
>

<button type="submit">
  LOGIN
</button>

</form>

<a
  href="/"
  class="home"
>
  ← Back to Brazil 2D
</a>

</div>

</div>

</body>
</html>`;
}


// ============================================================
// ADMIN PAGE
// ============================================================

async function adminPage(DB) {
  const today =
    getMyanmarDate();

  const query =
    await DB.prepare(`
      SELECT
        round_time,
        result,
        set_value,
        market_value
      FROM results
      WHERE result_date = ?
    `)
    .bind(today)
    .all();

  const rows =
    query.results || [];

  const map = {};

  let setValue = "";
  let marketValue = "";

  for (const row of rows) {
    map[row.round_time] =
      row.result || "";

    if (row.set_value) {
      setValue =
        row.set_value;
    }

    if (row.market_value) {
      marketValue =
        row.market_value;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Brazil 2D Admin</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background: #f3f6f4;
}

.admin {
  width: 100%;
  max-width: 500px;
  margin: auto;
  min-height: 100vh;
  background: #fff;
}

.header {
  background: #109447;
  color: #fff;
  padding: 22px;
  text-align: center;
  font-size: 24px;
  font-weight: 900;
}

.content {
  padding: 22px;
}

label {
  display: block;

  font-weight: 800;

  color: #333;

  margin:
    15px
    0
    7px;
}

input {
  width: 100%;

  height: 48px;

  padding:
    0
    13px;

  border:
    1px solid #ccc;

  border-radius: 10px;

  font-size: 17px;
}

.grid {
  display: grid;

  grid-template-columns:
    1fr
    1fr;

  gap: 12px;
}

.card {
  border:
    1px solid #ddd;

  border-radius: 14px;

  padding: 12px;
}

.card label {
  margin-top: 0;
  color: #109447;
}

.save {
  width: 100%;
  height: 54px;

  margin-top: 24px;

  border: 0;

  border-radius: 14px;

  background: #109447;

  color: #fff;

  font-size: 18px;

  font-weight: 900;
}

.links {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.links a {
  flex: 1;
  text-align: center;
  padding: 14px 5px;
  border-radius: 12px;
  text-decoration: none;
  font-weight: 800;
}

.home {
  color: #0762a9;
  background: #edf6fc;
}

.logout {
  color: #c62828;
  background: #fff0f0;
}

</style>

</head>

<body>

<div class="admin">

<div class="header">
  BRAZIL 2D ADMIN 🇧🇷
</div>

<div class="content">

<form
  method="POST"
  action="/admin/save"
>

<label>
  Result Date
</label>

<input
  type="date"
  name="result_date"
  value="${today}"
  required
>


<label>
  SET VALUE
</label>

<input
  type="text"
  name="set_value"
  value="${escapeHtml(setValue)}"
  placeholder="Example: 2,081.50"
>


<label>
  MARKET VALUE
</label>

<input
  type="text"
  name="market_value"
  value="${escapeHtml(marketValue)}"
  placeholder="Example: 69,135.01"
>


<label>
  2D RESULTS
</label>


<div class="grid">

${ROUNDS.map(round => `

<div class="card">

<label>
  ${round.time}
</label>

<input
  type="text"
  name="${round.field}"
  value="${
    valid2D(map[round.time])
      ? escapeHtml(map[round.time])
      : ""
  }"
  maxlength="2"
  inputmode="numeric"
  placeholder="--"
>

</div>

`).join("")}

</div>


<button
  class="save"
  type="submit"
>
  SAVE RESULTS
</button>

</form>


<div class="links">

<a
  class="home"
  href="/"
>
  Main Page
</a>

<a
  class="logout"
  href="/admin/logout"
>
  Logout
</a>

</div>

</div>

</div>

</body>
</html>`;
}


// ============================================================
// SAVE RESULTS
// ============================================================

async function saveResults(request, env) {
  const form =
    await request.formData();

  const resultDate =
    String(
      form.get("result_date") || ""
    ).trim();

  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(
      resultDate
    )
  ) {
    return new Response(
      "Invalid date",
      {
        status: 400
      }
    );
  }

  const setValue =
    String(
      form.get("set_value") || ""
    ).trim();

  const marketValue =
    String(
      form.get("market_value") || ""
    ).trim();


  for (const round of ROUNDS) {
    const newResult =
      String(
        form.get(round.field) || ""
      ).trim();


    if (
      newResult &&
      !valid2D(newResult)
    ) {
      return new Response(
        round.time +
        " result must be exactly 2 digits.",
        {
          status: 400
        }
      );
    }


    const existing =
      await env.DB.prepare(`
        SELECT
          result,
          set_value,
          market_value
        FROM results
        WHERE
          result_date = ?
          AND round_time = ?
        LIMIT 1
      `)
      .bind(
        resultDate,
        round.time
      )
      .first();


    const finalResult =
      newResult ||
      (
        existing &&
        valid2D(existing.result)
          ? existing.result
          : "--"
      );


    const finalSet =
      setValue ||
      (
        existing
          ? existing.set_value
          : null
      );


    const finalMarket =
      marketValue ||
      (
        existing
          ? existing.market_value
          : null
      );


    await env.DB.prepare(`
      INSERT INTO results (
        result_date,
        round_time,
        result,
        set_value,
        market_value,
        updated_at
      )

      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(
        result_date,
        round_time
      )

      DO UPDATE SET
        result = excluded.result,
        set_value = excluded.set_value,
        market_value = excluded.market_value,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      resultDate,
      round.time,
      finalResult,
      finalSet,
      finalMarket
    )
    .run();
  }


  return Response.redirect(
    new URL(
      "/admin",
      request.url
    ).toString(),
    303
  );
}


// ============================================================
// HISTORY PAGE
// DATE + 6 RESULT ONLY
// ============================================================

async function historyPage(DB) {
  const query =
    await DB.prepare(`
      SELECT
        result_date,
        round_time,
        result

      FROM results

      ORDER BY
        result_date DESC,

        CASE round_time
          WHEN '11:00 AM' THEN 1
          WHEN '01:00 PM' THEN 2
          WHEN '03:00 PM' THEN 3
          WHEN '05:00 PM' THEN 4
          WHEN '07:00 PM' THEN 5
          WHEN '09:00 PM' THEN 6
          ELSE 99
        END
    `)
    .all();

  const rows =
    query.results || [];

  const grouped = {};


  for (const row of rows) {

    if (!grouped[row.result_date]) {
      grouped[row.result_date] = {};
    }

    if (valid2D(row.result)) {
      grouped[
        row.result_date
      ][
        row.round_time
      ] =
        row.result;
    }

  }


  const historyHtml =
    Object.keys(grouped)
      .map(date => {

        const results =
          grouped[date];

        return `

<div class="day">

  <div class="date">
    ${escapeHtml(date)}
  </div>

  <div class="rounds">

    ${ROUNDS.map(round => `

      <div class="round ${round.color}">

        <div class="time">
          ${round.time}
        </div>

        <div class="number">
          ${escapeHtml(
            results[round.time] || "--"
          )}
        </div>

      </div>

    `).join("")}

  </div>

</div>

`;

      })
      .join("");


  return `<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Brazil 2D History</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background: #f2f6f3;

  color: #111;
}

.page {
  width: 100%;
  max-width: 480px;
  min-height: 100vh;
  margin: auto;
  background: #fff;
}

.header {
  background: #109447;

  color: #fff;

  min-height: 66px;

  display: flex;

  align-items: center;

  padding:
    0
    18px;
}

.back {
  font-size: 34px;
  margin-right: 15px;
  cursor: pointer;
}

.title {
  font-size: 20px;
  font-weight: 900;
}

.content {
  padding: 16px;
}

.day {
  margin-bottom: 20px;

  background: #fff;

  border-radius: 18px;

  box-shadow:
    0
    4px
    16px
    rgba(0,0,0,.08);

  padding: 15px;
}

.date {
  color: #0864ac;

  font-size: 19px;

  font-weight: 900;

  margin-bottom: 14px;
}

.rounds {
  display: grid;

  grid-template-columns:
    1fr
    1fr;

  gap: 8px;
}

.round {
  border:
    1.5px
    solid;

  border-radius: 12px;

  padding: 10px;

  text-align: center;

  background: #fff;
}

.round.green {
  border-color: #109447;
}

.round.yellow {
  border-color: #e8c327;
}

.round.blue {
  border-color: #176caf;
}

.time {
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 5px;
}

.round.green .time {
  color: #109447;
}

.round.yellow .time {
  color: #e8b900;
}

.round.blue .time {
  color: #0762a9;
}

.number {
  font-size: 27px;
  font-weight: 900;
  color: #111;
}

.empty {
  text-align: center;
  color: #999;
  padding: 80px 20px;
}

</style>

</head>

<body>

<div class="page">

  <div class="header">

    <div
      class="back"
      onclick="window.location.href='/'"
    >
      ‹
    </div>

    <div class="title">
      BRAZIL 2D HISTORY 🇧🇷
    </div>

  </div>


  <div class="content">

    ${
      historyHtml ||
      `
      <div class="empty">
        No history data yet.
      </div>
      `
    }

  </div>

</div>

</body>
</html>`;
            }
