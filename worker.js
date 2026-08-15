export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // MAIN PAGE
      if (url.pathname === "/" && request.method === "GET") {
        return htmlResponse(await mainPage(env.DB));
      }

      // HISTORY
      if (url.pathname === "/history" && request.method === "GET") {
        return htmlResponse(await historyPage(env.DB));
      }

      // ADMIN PAGE
      if (url.pathname === "/admin" && request.method === "GET") {
        return htmlResponse(adminPage());
      }

      // SAVE ADMIN RESULTS
      if (url.pathname === "/admin/save" && request.method === "POST") {
        return await saveResults(request, env);
      }

      return new Response("Not Found", { status: 404 });

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


/* ========================================
   HELPERS
======================================== */

function htmlResponse(html) {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}


function getMyanmarDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}


function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


const ROUNDS = [
  ["11:00 AM", "green"],
  ["01:00 PM", "yellow"],
  ["03:00 PM", "blue"],
  ["05:00 PM", "green"],
  ["07:00 PM", "yellow"],
  ["09:00 PM", "blue"]
];


/* ========================================
   MAIN PAGE
======================================== */

async function mainPage(DB) {
  const today = getMyanmarDate();

  const query = await DB.prepare(`
    SELECT
      result_date,
      round_time,
      result,
      set_value,
      market_value
    FROM results
    WHERE result_date = ?
    ORDER BY
      CASE round_time
        WHEN '11:00 AM' THEN 1
        WHEN '01:00 PM' THEN 2
        WHEN '03:00 PM' THEN 3
        WHEN '05:00 PM' THEN 4
        WHEN '07:00 PM' THEN 5
        WHEN '09:00 PM' THEN 6
        ELSE 99
      END
  `).bind(today).all();

  const rows = query.results || [];

  const resultMap = {};

  let liveResult = "--";
  let setValue = "--";
  let marketValue = "--";

  for (const row of rows) {
    resultMap[row.round_time] = row.result || "--";

    if (row.result && row.result !== "--") {
      liveResult = row.result;
    }

    if (row.set_value) {
      setValue = row.set_value;
    }

    if (row.market_value) {
      marketValue = row.market_value;
    }
  }

  const firstDigit =
    liveResult !== "--" && liveResult.length >= 1
      ? liveResult.charAt(0)
      : "-";

  const secondDigit =
    liveResult !== "--" && liveResult.length >= 2
      ? liveResult.charAt(1)
      : "-";

  return `<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

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
  background: #eef3f0;
  font-family: Arial, Helvetica, sans-serif;
}

body {
  color: #111;
}

.app {
  width: 100%;
  max-width: 480px;
  min-height: 100vh;
  margin: 0 auto;
  background: #fff;
  position: relative;
  overflow: hidden;
}


/* LIVE TITLE */

.live-header {
  padding: 22px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
}

.brand {
  font-size: 25px;
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
  padding: 12px 15px;
  border-radius: 28px;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.live-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  background: #08a34b;
  border-radius: 50%;
  margin-right: 7px;
  vertical-align: -1px;
  animation: pulse 1.3s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }

  50% {
    opacity: .35;
  }
}


/* HERO */

.hero {
  position: relative;
  text-align: center;
  padding: 25px 20px 70px;
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
    linear-gradient(#fff, #fff);
}

.hero::after {
  content: "";
  position: absolute;
  left: -8%;
  right: -8%;
  bottom: 0;
  height: 82px;

  background:
    linear-gradient(
      168deg,
      transparent 0 34%,
      rgba(23,156,79,.50) 35% 52%,
      rgba(247,205,26,.80) 53% 64%,
      rgba(16,101,179,.55) 65% 100%
    );

  z-index: 0;
}

.hero-content {
  position: relative;
  z-index: 2;
}

.big-result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;

  line-height: .9;

  margin:
    5px
    0
    30px;
}

.digit {
  font-size:
    clamp(
      128px,
      37vw,
      176px
    );

  font-weight: 900;
  letter-spacing: -10px;
}

.digit-one {
  color: #119447;
}

.digit-two {
  color: #ffc400;
}

.date-time {
  color: #075ea8;
  font-size: 19px;
  font-weight: 900;
  letter-spacing: .5px;
}


/* VALUE CARD */

.value-card {
  position: relative;
  z-index: 5;

  width:
    calc(
      100% - 46px
    );

  margin:
    -36px
    auto
    24px;

  background: #fff;

  border-radius: 24px;

  box-shadow:
    0
    5px
    18px
    rgba(0,0,0,.13);

  display: flex;

  padding:
    25px
    8px;
}

.value-item {
  width: 50%;
  text-align: center;
  padding: 3px 10px;
}

.value-item:first-child {
  border-right:
    1px
    solid
    #e4e4e4;
}

.value-label {
  color: #0b9347;
  font-size: 14px;
  font-weight: 900;
  margin-bottom: 10px;
}

.value-number {
  color: #050505;
  font-size: 25px;
  font-weight: 900;
  white-space: nowrap;
}


/* ROUND RESULTS */

.round-grid {
  padding:
    0
    22px;

  display: grid;

  grid-template-columns:
    repeat(
      2,
      1fr
    );

  gap: 13px;
}

.round {
  height: 112px;

  border:
    2px
    solid;

  border-radius: 19px;

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
  font-size: 15px;
  font-weight: 900;
  margin-bottom: 8px;
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
  font-size: 39px;
  line-height: 1;
  font-weight: 900;
}


/* HISTORY */

.bottom {
  padding:
    26px
    22px
    70px;

  position: relative;
}

.history-btn {
  width: 100%;
  height: 72px;

  border:
    2px
    solid
    #15994c;

  border-radius: 38px;

  background: #fff;

  color: #129448;

  font-size: 20px;

  font-weight: 900;

  cursor: pointer;
}

.bottom-wave {
  position: absolute;

  left: -5%;
  right: -5%;
  bottom: 0;

  height: 48px;

  background:
    linear-gradient(
      174deg,
      rgba(20,153,74,.75) 0 25%,
      #ffdd16 26% 54%,
      #0965b5 55% 100%
    );
}


@media (max-width: 380px) {

  .brand {
    font-size: 21px;
  }

  .live-pill {
    font-size: 11px;
    padding: 10px 12px;
  }

  .value-number {
    font-size: 21px;
  }

  .round-grid {
    padding: 0 15px;
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


    <div class="big-result">

      <span
        class="digit digit-one"
        id="digit1"
      >${escapeHtml(firstDigit)}</span>

      <span
        class="digit digit-two"
        id="digit2"
      >${escapeHtml(secondDigit)}</span>

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
      SET VALUE
    </div>

    <div
      class="value-number"
      id="setValue"
    >
      ${escapeHtml(setValue)}
    </div>

  </div>


  <div class="value-item">

    <div class="value-label">
      MARKET VALUE
    </div>

    <div
      class="value-number"
      id="marketValue"
    >
      ${escapeHtml(marketValue)}
    </div>

  </div>


</section>


<section class="round-grid">

${ROUNDS.map(([time, color]) => `
  <div class="round ${color}">

    <div class="round-time">
      ${time}
    </div>

    <div class="round-number">
      ${escapeHtml(resultMap[time] || "--")}
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

function updateClock() {

  const now = new Date();


  const parts =
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
      parts +
      " | " +
      time;

}


updateClock();

setInterval(
  updateClock,
  1000
);

</script>


</body>
</html>`;
}


/* ========================================
   ADMIN PAGE
======================================== */

function adminPage(message = "") {

  const today = getMyanmarDate();

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

.message {
  text-align: center;

  color: #109447;

  font-weight: 800;

  margin-bottom: 16px;
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
    1px
    solid
    #ccc;

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
    1px
    solid
    #ddd;

  border-radius: 14px;

  padding: 12px;
}

.card label {
  margin-top: 0;

  color: #109447;
}

button {
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


<div class="admin">


<div class="header">

  BRAZIL 2D ADMIN 🇧🇷

</div>


<div class="content">


${message
  ? `<div class="message">${escapeHtml(message)}</div>`
  : ""
}


<form
  method="POST"
  action="/admin/save"
>


<label>
  Admin Password
</label>

<input
  type="password"
  name="password"
  required
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
  placeholder="Example: 2,081.50"
>


<label>
  MARKET VALUE
</label>

<input
  type="text"
  name="market_value"
  placeholder="Example: 69,135.01"
>


<label>
  2D RESULTS
</label>


<div class="grid">


<div class="card">

<label>
  11:00 AM
</label>

<input
  type="text"
  name="r1100"
  maxlength="2"
  inputmode="numeric"
  placeholder="--"
>

</div>


<div class="card">

<label>
  01:00 PM
</label>

<input
  type="text"
  name="r1300"
  maxlength="2"
  inputmode="numeric"
  placeholder="--"
>

</div>


<div class="card">

<label>
  03:00 PM
</label>

<input
  type="text"
  name="r1500"
  maxlength="2"
  inputmode="numeric"
  placeholder="--"
>

</div>


<div class="card">

<label>
  05:00 PM
</label>

<input
  type="text"
  name="r1700"
  maxlength="2"
  inputmode="numeric"
  placeholder="--"
>

</div>


<div class="card">

<label>
  07:00 PM
</label>

<input
  type="text"
  name="r1900"
  maxlength="2"
  inputmode="numeric"
  placeholder="--"
>

</div>


<div class="card">

<label>
  09:00 PM
</label>

<input
  type="text"
  name="r2100"
  maxlength="2"
  inputmode="numeric"
  placeholder="--"
>

</div>


</div>


<button type="submit">

  SAVE RESULTS

</button>


</form>


<a
  class="home"
  href="/"
>
  ← Back to Brazil 2D
</a>


</div>

</div>


</body>
</html>`;
}


/* ========================================
   SAVE RESULT
======================================== */

async function saveResults(request, env) {

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

    return new Response(
      adminPage(
        "Wrong admin password."
      ),
      {
        status: 401,
        headers: {
          "Content-Type":
            "text/html; charset=UTF-8"
        }
      }
    );

  }


  const resultDate =
    String(
      form.get("result_date") || ""
    );


  if (!resultDate) {

    return htmlResponse(
      adminPage(
        "Result date is required."
      )
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


  const inputResults = [

    [
      "11:00 AM",
      String(form.get("r1100") || "").trim()
    ],

    [
      "01:00 PM",
      String(form.get("r1300") || "").trim()
    ],

    [
      "03:00 PM",
      String(form.get("r1500") || "").trim()
    ],

    [
      "05:00 PM",
      String(form.get("r1700") || "").trim()
    ],

    [
      "07:00 PM",
      String(form.get("r1900") || "").trim()
    ],

    [
      "09:00 PM",
      String(form.get("r2100") || "").trim()
    ]

  ];


  for (
    const [roundTime, result]
    of inputResults
  ) {

    if (!result) {
      continue;
    }


    if (
      !/^[0-9]{2}$/.test(result)
    ) {

      return htmlResponse(
        adminPage(
          roundTime +
          " result must be exactly 2 digits."
        )
      );

    }


    await env.DB.prepare(`
      INSERT INTO results (
        result_date,
        round_time,
        result,
        set_value,
        market_value,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)

      ON CONFLICT(result_date, round_time)

      DO UPDATE SET
        result = excluded.result,
        set_value = excluded.set_value,
        market_value = excluded.market_value,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      resultDate,
      roundTime,
      result,
      setValue || null,
      marketValue || null
    )
    .run();

  }


  return Response.redirect(
    new URL("/", request.url).toString(),
    303
  );
}


/* ========================================
   HISTORY PAGE
======================================== */

async function historyPage(DB) {

  const query =
    await DB.prepare(`
      SELECT
        result_date,
        round_time,
        result,
        set_value,
        market_value
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
    `).all();


  const rows =
    query.results || [];


  const grouped = {};


  for (const row of rows) {

    if (
      !grouped[row.result_date]
    ) {

      grouped[row.result_date] = {
        setValue: "",
        marketValue: "",
        results: {}
      };

    }


    grouped[
      row.result_date
    ].results[
      row.round_time
    ] =
      row.result;


    if (row.set_value) {

      grouped[
        row.result_date
      ].setValue =
        row.set_value;

    }


    if (row.market_value) {

      grouped[
        row.result_date
      ].marketValue =
        row.market_value;

    }

  }


  const historyHtml =
    Object.keys(grouped)
      .map(date => {

        const day =
          grouped[date];

        return `

<div class="day">

<div class="date">
  ${escapeHtml(date)}
</div>


<div class="values">

  <span>
    SET:
    <b>
      ${escapeHtml(day.setValue || "--")}
    </b>
  </span>

  <span>
    MARKET:
    <b>
      ${escapeHtml(day.marketValue || "--")}
    </b>
  </span>

</div>


<div class="rounds">

${ROUNDS.map(([time, color]) => `

<div class="round ${color}">

  <div class="time">
    ${time}
  </div>

  <div class="number">
    ${escapeHtml(day.results[time] || "--")}
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

  min-height: 72px;

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
  font-size: 21px;

  font-weight: 900;
}

.content {
  padding: 18px;
}

.day {
  margin-bottom: 22px;

  background: #fff;

  border-radius: 18px;

  box-shadow:
    0
    4px
    16px
    rgba(0,0,0,.08);

  padding: 16px;
}

.date {
  color: #0864ac;

  font-size: 19px;

  font-weight: 900;

  margin-bottom: 12px;
}

.values {
  display: flex;

  justify-content:
    space-between;

  gap: 10px;

  font-size: 12px;

  color: #109447;

  margin-bottom: 15px;
}

.rounds {
  display: grid;

  grid-template-columns:
    1fr
    1fr;

  gap: 9px;
}

.round {
  border:
    1.5px
    solid;

  border-radius: 12px;

  padding: 11px;

  text-align: center;
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

.number {
  font-size: 27px;

  font-weight: 900;
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
    onclick="history.back()"
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
