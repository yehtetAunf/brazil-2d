// ============================================================
// BRAZIL 2D
// Cloudflare Worker + D1
// Live SET / VALUE + Live 2D
// 6 Rounds
// Final Admin Result Hold = 3 minutes
// ============================================================

const ROUNDS = [
  {
    time: "11:00 AM",
    minutes: 11 * 60,
    id: "r1100",
    field: "r1100",
    color: "green"
  },
  {
    time: "01:00 PM",
    minutes: 13 * 60,
    id: "r1300",
    field: "r1300",
    color: "yellow"
  },
  {
    time: "03:00 PM",
    minutes: 15 * 60,
    id: "r1500",
    field: "r1500",
    color: "blue"
  },
  {
    time: "05:00 PM",
    minutes: 17 * 60,
    id: "r1700",
    field: "r1700",
    color: "green"
  },
  {
    time: "07:00 PM",
    minutes: 19 * 60,
    id: "r1900",
    field: "r1900",
    color: "yellow"
  },
  {
    time: "09:00 PM",
    minutes: 21 * 60,
    id: "r2100",
    field: "r2100",
    color: "blue"
  }
];

const RESULT_HOLD_SECONDS = 180;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {

      // ======================================================
      // USER MAIN PAGE
      // ======================================================
      if (
        url.pathname === "/" &&
        request.method === "GET"
      ) {
        return html(
          await mainPage(env.DB)
        );
      }

      // ======================================================
      // LIVE API
      // ======================================================
      if (
        url.pathname === "/api/live" &&
        request.method === "GET"
      ) {
        return json(
          await getLiveState(env.DB)
        );
      }

      // ======================================================
      // HISTORY
      // ======================================================
      if (
        url.pathname === "/history" &&
        request.method === "GET"
      ) {
        return html(
          await historyPage(env.DB)
        );
      }

      // ======================================================
      // ADMIN
      // ======================================================
      if (
        url.pathname === "/admin" &&
        request.method === "GET"
      ) {
        const loggedIn =
          await isAdmin(request, env);

        if (!loggedIn) {
          return html(
            adminLoginPage()
          );
        }

        return html(
          await adminPage(
            env.DB,
            url.searchParams.get("date")
          )
        );
      }

      // ======================================================
      // ADMIN LOGIN
      // ======================================================
      if (
        url.pathname === "/admin/login" &&
        request.method === "POST"
      ) {
        return await adminLogin(
          request,
          env
        );
      }

      // ======================================================
      // ADMIN LOGOUT
      // ======================================================
      if (
        url.pathname === "/admin/logout"
      ) {
        return new Response(
          null,
          {
            status: 302,
            headers: {
              Location: "/admin",

              "Set-Cookie":
                "brazil_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
            }
          }
        );
      }

      // ======================================================
      // ADMIN SAVE
      // ======================================================
      if (
        url.pathname === "/admin/save" &&
        request.method === "POST"
      ) {
        const loggedIn =
          await isAdmin(
            request,
            env
          );

        if (!loggedIn) {
          return Response.redirect(
            new URL(
              "/admin",
              request.url
            ).toString(),
            303
          );
        }

        return await saveResults(
          request,
          env
        );
      }

      return new Response(
        "Not Found",
        {
          status: 404
        }
      );

    } catch (error) {

      console.error(error);

      return new Response(
        "Brazil 2D Error: " +
        error.message,
        {
          status: 500,
          headers: {
            "Content-Type":
              "text/plain; charset=UTF-8"
          }
        }
      );
    }
  }
};


// ============================================================
// RESPONSE HELPERS
// ============================================================

function html(content, status = 200) {

  return new Response(
    content,
    {
      status,
      headers: {
        "Content-Type":
          "text/html; charset=UTF-8",

        "Cache-Control":
          "no-store, no-cache, must-revalidate"
      }
    }
  );
}


function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",

        "Cache-Control":
          "no-store, no-cache, must-revalidate"
      }
    }
  );
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

  return /^[0-9]{2}$/.test(
    String(value || "")
  );
}


function pad2(number) {

  return String(number)
    .padStart(2, "0");
}


// ============================================================
// MYANMAR TIME
// ============================================================

function getYangonParts() {

  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          "Asia/Yangon",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hour12:
          false
      }
    ).formatToParts(
      new Date()
    );

  const values = {};

  for (const part of parts) {

    if (
      part.type !==
      "literal"
    ) {
      values[
        part.type
      ] =
        part.value;
    }
  }

  let hour =
    Number(
      values.hour
    );

  if (hour === 24) {
    hour = 0;
  }

  return {
    year:
      Number(
        values.year
      ),

    month:
      Number(
        values.month
      ),

    day:
      Number(
        values.day
      ),

    hour,

    minute:
      Number(
        values.minute
      ),

    second:
      Number(
        values.second
      )
  };
}


function getMyanmarDate() {

  const p =
    getYangonParts();

  return (
    p.year +
    "-" +
    pad2(p.month) +
    "-" +
    pad2(p.day)
  );
}


function getCurrentSeconds() {

  const p =
    getYangonParts();

  return (
    p.hour * 3600 +
    p.minute * 60 +
    p.second
  );
}


function roundReleaseSeconds(round) {

  return (
    round.minutes *
    60
  );
}


// ============================================================
// ADMIN TOKEN
// ============================================================

async function createSignature(
  value,
  secret
) {

  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",

      encoder.encode(
        secret
      ),

      {
        name:
          "HMAC",

        hash:
          "SHA-256"
      },

      false,

      [
        "sign"
      ]
    );


  const signature =
    await crypto.subtle.sign(
      "HMAC",

      key,

      encoder.encode(
        value
      )
    );


  return arrayBufferToBase64Url(
    signature
  );
}


function arrayBufferToBase64Url(
  buffer
) {

  const bytes =
    new Uint8Array(
      buffer
    );

  let binary = "";

  for (
    const byte
    of bytes
  ) {
    binary +=
      String.fromCharCode(
        byte
      );
  }

  return btoa(binary)
    .replaceAll(
      "+",
      "-"
    )
    .replaceAll(
      "/",
      "_"
    )
    .replaceAll(
      "=",
      ""
    );
}


function getCookie(
  request,
  name
) {

  const cookie =
    request.headers.get(
      "Cookie"
    ) || "";

  const pieces =
    cookie.split(";");


  for (
    const piece
    of pieces
  ) {

    const [
      key,
      ...rest
    ] =
      piece
        .trim()
        .split("=");


    if (
      key === name
    ) {
      return rest.join(
        "="
      );
    }
  }

  return "";
}


async function createAdminToken(
  secret
) {

  const expires =
    Date.now() +
    12 *
    60 *
    60 *
    1000;


  const data =
    String(
      expires
    );


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


async function isAdmin(
  request,
  env
) {

  if (
    !env.ADMIN_PASSWORD
  ) {
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


  if (
    pieces.length !==
    2
  ) {
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


async function adminLogin(
  request,
  env
) {

  const form =
    await request.formData();


  const password =
    String(
      form.get(
        "password"
      ) || ""
    );


  if (
    !env.ADMIN_PASSWORD ||
    password !==
      env.ADMIN_PASSWORD
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


  return new Response(
    null,
    {
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
    }
  );
}


// ============================================================
// LIVE MARKET API
//
// SET   = BTC volume
// VALUE = BTC price
// ============================================================

async function fetchLiveMarket() {

  const endpoint =
    "https://api.exchange.coinbase.com/products/BTC-USD/ticker";


  try {

    const cache =
      caches.default;


    const cacheKey =
      new Request(
        "https://brazil2d.local/cache/btc-usd-ticker"
      );


    let response =
      await cache.match(
        cacheKey
      );


    if (!response) {

      const upstream =
        await fetch(
          endpoint,
          {
            headers: {
              Accept:
                "application/json",

              "User-Agent":
                "Brazil-2D/1.0"
            }
          }
        );


      if (
        !upstream.ok
      ) {
        throw new Error(
          "Market API HTTP " +
          upstream.status
        );
      }


      const data =
        await upstream.json();


      response =
        new Response(
          JSON.stringify(
            data
          ),
          {
            headers: {
              "Content-Type":
                "application/json",

              "Cache-Control":
                "public, max-age=10"
            }
          }
        );


      await cache.put(
        cacheKey,
        response.clone()
      );
    }


    const data =
      await response.json();


    const price =
      Number(
        data.price
      );


    const volume =
      Number(
        data.volume
      );


    return {

      ok:
        Number.isFinite(
          price
        ) &&
        Number.isFinite(
          volume
        ),

      set:
        Number.isFinite(
          volume
        )
          ? volume.toFixed(
              2
            )
          : "--",

      value:
        Number.isFinite(
          price
        )
          ? price.toFixed(
              2
            )
          : "--",

      source:
        "Coinbase BTC-USD",

      fetched_at:
        new Date()
          .toISOString()
    };

  } catch (error) {

    console.error(
      "Market API error",
      error
    );


    return {
      ok: false,
      set: "--",
      value: "--",
      source:
        "Coinbase BTC-USD"
    };
  }
}


// ============================================================
// DATABASE DATA
// ============================================================

async function queryTodayResults(
  DB
) {

  const today =
    getMyanmarDate();


  const query =
    await DB.prepare(`
      SELECT
        result_date,
        round_time,
        result,
        set_value,
        market_value

      FROM results

      WHERE
        result_date = ?
    `)
    .bind(today)
    .all();


  return (
    query.results ||
    []
  );
}


// ============================================================
// LIVE STATE
// ============================================================

async function getLiveState(
  DB
) {

  const today =
    getMyanmarDate();


  const nowSeconds =
    getCurrentSeconds();


  const rows =
    await queryTodayResults(
      DB
    );


  const map =
    new Map(
      rows.map(
        row => [
          row.round_time,
          row
        ]
      )
    );


  const market =
    await fetchLiveMarket();


  const releasedResults =
    {};


  let latestReleased =
    null;


  for (
    const round
    of ROUNDS
  ) {

    const release =
      roundReleaseSeconds(
        round
      );


    const row =
      map.get(
        round.time
      );


    if (
      nowSeconds >=
      release
    ) {

      if (
        row &&
        valid2D(
          row.result
        )
      ) {

        releasedResults[
          round.id
        ] =
          row.result;


        latestReleased = {
          round,
          row
        };

      } else {

        releasedResults[
          round.id
        ] =
          "--";
      }

    } else {

      releasedResults[
        round.id
      ] =
        "--";
    }
  }


  // ========================================================
  // 3 MINUTE FINAL HOLD
  // ========================================================

  let resultHold =
    null;


  for (
    let i =
      ROUNDS.length - 1;

    i >= 0;

    i--
  ) {

    const round =
      ROUNDS[i];


    const release =
      roundReleaseSeconds(
        round
      );


    const elapsed =
      nowSeconds -
      release;


    if (
      elapsed >= 0 &&
      elapsed <
        RESULT_HOLD_SECONDS
    ) {

      const row =
        map.get(
          round.time
        );


      if (
        row &&
        valid2D(
          row.result
        )
      ) {

        resultHold = {

          active:
            true,

          round_time:
            round.time,

          result:
            row.result,

          elapsed_seconds:
            elapsed,

          seconds_remaining:
            RESULT_HOLD_SECONDS -
            elapsed,

          set:
            row.set_value ||
            market.set,

          value:
            row.market_value ||
            market.value
        };
      }

      break;
    }
  }


  // ========================================================
  // NEXT ROUND
  // ========================================================

  let nextRound =
    null;


  for (
    const round
    of ROUNDS
  ) {

    const release =
      roundReleaseSeconds(
        round
      );


    if (
      nowSeconds <
      release
    ) {

      nextRound = {

        round_time:
          round.time,

        seconds_until:
          release -
          nowSeconds
      };

      break;
    }
  }


  return {

    success:
      true,

    date:
      today,

    serverNow:
      Date.now(),

    market,

    resultHold,

    nextRound,

    latest_result:
      latestReleased
        ? latestReleased.row.result
        : "--",

    latest_round:
      latestReleased
        ? latestReleased.round.time
        : null,

    results:
      releasedResults
  };
}


// ============================================================
// USER PAGE
// ============================================================

async function mainPage(
  DB
) {

  const state =
    await getLiveState(
      DB
    );


  const hold =
    state.resultHold;


  const initialResult =
    hold?.active
      ? hold.result
      : "--";


  return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1.0,maximum-scale=1.0">

<title>Brazil 2D</title>

<style>

*{
  box-sizing:border-box;
  margin:0;
  padding:0;
}

html,
body{
  width:100%;
  min-height:100%;
  background:#fff;
  font-family:Arial,Helvetica,sans-serif;
}

body{
  color:#111;
}

.app{
  width:100%;
  max-width:480px;
  min-height:100dvh;
  margin:0 auto;
  background:#fff;
  overflow:hidden;
}


/* ==========================================
   HEADER
========================================== */

.live-header{
  height:58px;
  padding:8px 18px;

  display:flex;
  align-items:center;
  justify-content:space-between;
}

.brand{
  font-size:22px;
  font-weight:900;
  font-style:italic;
  white-space:nowrap;
}

.brand-brazil{
  color:#109447;
}

.brand-2{
  color:#0864ac;
}

.brand-d{
  color:#f4be00;
}

.live-pill{
  background:#e2f5e9;
  color:#078f40;

  padding:9px 12px;

  border-radius:26px;

  font-size:11px;
  font-weight:900;

  white-space:nowrap;
}

.live-dot{
  display:inline-block;

  width:10px;
  height:10px;

  background:#08a34b;

  border-radius:50%;

  margin-right:6px;

  vertical-align:-1px;

  animation:pulse 1.3s infinite;
}

@keyframes pulse{

  0%,100%{
    opacity:1;
  }

  50%{
    opacity:.35;
  }
}


/* ==========================================
   HERO
========================================== */

.hero{
  position:relative;

  height:215px;

  text-align:center;

  overflow:hidden;

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

.hero::after{
  content:"";

  position:absolute;

  left:-8%;
  right:-8%;
  bottom:0;

  height:56px;

  background:
    linear-gradient(
      168deg,
      transparent 0 30%,
      rgba(23,156,79,.50) 31% 52%,
      rgba(247,205,26,.80) 53% 65%,
      rgba(16,101,179,.55) 66% 100%
    );

  z-index:0;
}

.hero-content{
  height:100%;

  position:relative;

  z-index:2;

  display:flex;

  flex-direction:column;

  align-items:center;

  justify-content:center;

  padding-bottom:36px;
}


/* ==========================================
   BIG RESULT
========================================== */

.live-result-box{
  width:100%;
  height:126px;

  position:relative;

  display:flex;
  align-items:center;
  justify-content:center;
}

.result-digits{
  display:flex;
  align-items:center;
  justify-content:center;

  line-height:.86;
}

.digit{
  font-size:clamp(
    110px,
    31vw,
    148px
  );

  font-weight:900;

  letter-spacing:-8px;
}

.digit-one{
  color:#109447;
}

.digit-two{
  color:#ffc400;
}

.no-result{
  color:#111;

  font-size:64px;

  font-weight:900;
}


/* ==========================================
   LIVE CHANGE ANIMATION
========================================== */

.live-change{
  animation:
    liveBlink
    .82s
    ease-in-out
    1;
}

@keyframes liveBlink{

  0%,100%{
    opacity:1;
    transform:scale(1);
  }

  45%{
    opacity:.20;
    transform:scale(.96);
  }

  65%{
    opacity:1;
    transform:scale(1.025);
  }
}


/* ==========================================
   FINAL RESULT RING
========================================== */

.result-loader{
  display:none;

  position:absolute;

  width:72px;
  height:72px;

  border-radius:50%;

  border:
    7px solid
    rgba(70,70,200,.12);

  border-top-color:
    #315fd4;

  border-right-color:
    #8b42db;

  border-bottom-color:
    #315fd4;

  animation:
    resultSpin
    .70s
    linear
    infinite;
}

.result-loader.show{
  display:block;
}

@keyframes resultSpin{

  from{
    transform:rotate(0deg);
  }

  to{
    transform:rotate(360deg);
  }
}


.date-time{
  color:#075ea8;

  font-size:15px;

  font-weight:900;

  white-space:nowrap;
}


/* ==========================================
   SET / VALUE
========================================== */

.value-card{
  position:relative;

  z-index:5;

  width:calc(100% - 36px);

  height:76px;

  margin:-28px auto 12px;

  background:#fff;

  border-radius:20px;

  box-shadow:
    0 5px 16px
    rgba(0,0,0,.12);

  display:flex;

  align-items:center;

  padding:8px;
}

.value-item{
  width:50%;

  text-align:center;

  padding:2px 8px;
}

.value-item:first-child{
  border-right:
    1px solid
    #e4e4e4;
}

.value-label{
  color:#0b9347;

  font-size:12px;

  font-weight:900;

  margin-bottom:5px;
}

.value-number{
  color:#050505;

  font-size:21px;

  font-weight:900;

  white-space:nowrap;
}


/* ==========================================
   ROUND CARDS
========================================== */

.round-grid{
  padding:0 18px;

  display:grid;

  grid-template-columns:
    repeat(2,1fr);

  gap:8px 10px;
}

.round{
  height:73px;

  border:2px solid;

  border-radius:15px;

  background:#fff;

  display:flex;

  flex-direction:column;

  align-items:center;

  justify-content:center;
}

.round.green{
  border-color:#16984d;
}

.round.yellow{
  border-color:#e8c327;
}

.round.blue{
  border-color:#176caf;
}

.round-time{
  font-size:12px;

  font-weight:900;

  margin-bottom:4px;
}

.round.green .round-time{
  color:#109447;
}

.round.yellow .round-time{
  color:#e8b900;
}

.round.blue .round-time{
  color:#0762a9;
}

.round-number{
  color:#0a0a0a;

  font-size:29px;

  line-height:1;

  font-weight:900;
}


/* ==========================================
   HISTORY
========================================== */

.bottom{
  padding:11px 18px 38px;

  position:relative;
}

.history-btn{
  width:100%;

  height:48px;

  border:
    2px solid
    #15994c;

  border-radius:28px;

  background:#fff;

  color:#129448;

  font-size:17px;

  font-weight:900;
}

.bottom-wave{
  position:absolute;

  left:-5%;
  right:-5%;
  bottom:0;

  height:27px;

  background:
    linear-gradient(
      174deg,
      rgba(20,153,74,.75) 0 25%,
      #ffdd16 26% 54%,
      #0965b5 55% 100%
    );
}


@media(max-height:700px){

  .live-header{
    height:52px;
  }

  .hero{
    height:188px;
  }

  .live-result-box{
    height:106px;
  }

  .digit{
    font-size:102px;
  }

  .value-card{
    height:68px;
  }

  .round{
    height:65px;
  }

  .round-number{
    font-size:26px;
  }

  .history-btn{
    height:43px;
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


<div
  class="live-result-box"
  id="liveResultBox"
>


  <div
    class="result-digits"
    id="resultDigits"
    ${
      valid2D(initialResult)
        ? ""
        : 'style="display:none;"'
    }
  >

    <span
      class="digit digit-one"
      id="digit1"
    >
      ${
        valid2D(initialResult)
          ? initialResult.charAt(0)
          : ""
      }
    </span>

    <span
      class="digit digit-two"
      id="digit2"
    >
      ${
        valid2D(initialResult)
          ? initialResult.charAt(1)
          : ""
      }
    </span>

  </div>


  <div
    class="no-result"
    id="noResult"
    ${
      valid2D(initialResult)
        ? 'style="display:none;"'
        : ""
    }
  >
    --
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
    ${
      hold?.active
        ? escapeHtml(
            hold.set
          )
        : "--"
    }
  </div>

</div>


<div class="value-item">

  <div class="value-label">
    VALUE
  </div>

  <div
    class="value-number"
    id="valueValue"
  >
    ${
      hold?.active
        ? escapeHtml(
            hold.value
          )
        : "--"
    }
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
      state.results[
        round.id
      ] || "--"
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

// ============================================================
// LIVE FRONTEND
// ============================================================

const MARKET_JUMP_MS =
  10000;

const BLINK_INTERVAL_MS =
  3500;


let serverBase =
  ${Number(
    state.serverNow
  )};

let perfBase =
  performance.now();


let marketBase =
  null;


let marketJumpIndex =
  0;


let marketJumpTimer =
  null;


let blinkTimer =
  null;


let apiTimer =
  null;


let holdActive =
  ${
    hold?.active
      ? "true"
      : "false"
  };


let activeHoldRound =
  ${
    JSON.stringify(
      hold?.round_time ||
      null
    )
  };


let ringBusy =
  false;


// ============================================================
// CLOCK
// ============================================================

function estimatedServerNow(){

  return (
    serverBase +
    (
      performance.now() -
      perfBase
    )
  );
}


function updateClock(){

  const now =
    new Date(
      estimatedServerNow()
    );


  const date =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          "Asia/Yangon",

        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric"
      }
    ).format(now);


  const time =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Yangon",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hour12:
          true
      }
    ).format(now);


  document
    .getElementById(
      "dateTime"
    )
    .textContent =
      date +
      " | " +
      time;
}


setInterval(
  updateClock,
  1000
);


updateClock();


// ============================================================
// LIVE SET / VALUE JUMP
// ============================================================

function format2(value){

  return Number(
    value
  ).toFixed(2);
}


function makeJumpMarket(
  base,
  index
){

  if (
    !base ||
    !base.ok
  ) {

    return {
      ok:false,
      set:"--",
      value:"--"
    };
  }


  const baseSet =
    Number(
      base.set
    );


  const baseValue =
    Number(
      base.value
    );


  if (
    !Number.isFinite(
      baseSet
    ) ||
    !Number.isFinite(
      baseValue
    )
  ) {

    return {
      ok:false,
      set:"--",
      value:"--"
    };
  }


  // SET movement
  const setSteps = [
    0,
    -297.98,
    -275.79,
    126.24,
    -143.67,
    218.31,
    -84.52,
    341.16
  ];


  // VALUE movement
  const valueSteps = [
    0,
    0.03,
    0.06,
    0.02,
    0.08,
    0.05,
    0.11,
    0.07
  ];


  const nextSet =
    Math.max(
      0,
      baseSet +
      setSteps[
        index %
        setSteps.length
      ]
    );


  const nextValue =
    baseValue +
    valueSteps[
      index %
      valueSteps.length
    ];


  return {

    ok:true,

    set:
      format2(
        nextSet
      ),

    value:
      format2(
        nextValue
      )
  };
}


// ============================================================
// CALCULATE LIVE 2D
//
// SET = last digit
// VALUE = integer part last digit
// ============================================================

function calculate2D(
  setValue,
  valueValue
){

  const setText =
    String(
      setValue || ""
    ).trim();


  const valueText =
    String(
      valueValue || ""
    ).trim();


  const setDigits =
    setText.replace(
      /\\D/g,
      ""
    );


  if (!setDigits) {
    return null;
  }


  const setDigit =
    setDigits.slice(-1);


  const valueInteger =
    valueText
      .split(".")[0]
      .replace(
        /\\D/g,
        ""
      );


  if (!valueInteger) {
    return null;
  }


  const valueDigit =
    valueInteger.slice(-1);


  return (
    setDigit +
    valueDigit
  );
}


// ============================================================
// SHOW BIG 2D
// ============================================================

function showBig2D(
  result
){

  if (
    !/^\\d{2}$/.test(
      result || ""
    )
  ) {
    return;
  }


  const digits =
    document.getElementById(
      "resultDigits"
    );


  const noResult =
    document.getElementById(
      "noResult"
    );


  noResult.style.display =
    "none";


  digits.style.display =
    "flex";


  document
    .getElementById(
      "digit1"
    )
    .textContent =
      result.charAt(0);


  document
    .getElementById(
      "digit2"
    )
    .textContent =
      result.charAt(1);
}


// ============================================================
// PAINT LIVE FRAME
// ============================================================

function paintLiveMarket(){

  if (
    holdActive ||
    !marketBase ||
    !marketBase.ok
  ) {
    return;
  }


  const live =
    makeJumpMarket(
      marketBase,
      marketJumpIndex
    );


  if (!live.ok) {
    return;
  }


  document
    .getElementById(
      "setValue"
    )
    .textContent =
      live.set;


  document
    .getElementById(
      "valueValue"
    )
    .textContent =
      live.value;


  const twoD =
    calculate2D(
      live.set,
      live.value
    );


  if (twoD) {
    showBig2D(
      twoD
    );
  }
}


// ============================================================
// BLINK LIKE REFERENCE
// ============================================================

function blinkLiveNumbers(){

  if (holdActive) {
    return;
  }


  const nodes = [

    document.getElementById(
      "resultDigits"
    ),

    document.getElementById(
      "setValue"
    ),

    document.getElementById(
      "valueValue"
    )
  ];


  if (
    nodes.some(
      node =>
        !node ||
        node.textContent.trim() ===
        "--"
    )
  ) {
    return;
  }


  nodes.forEach(
    node =>
      node.classList.remove(
        "live-change"
      )
  );


  void nodes[0].offsetWidth;


  nodes.forEach(
    node =>
      node.classList.add(
        "live-change"
      )
  );
}


// ============================================================
// START / STOP LIVE MOVEMENT
// ============================================================

function startLiveMovement(){

  if (holdActive) {
    return;
  }


  paintLiveMarket();


  if (!marketJumpTimer) {

    marketJumpTimer =
      setInterval(
        function(){

          if (
            holdActive
          ) {
            return;
          }


          marketJumpIndex =
            (
              marketJumpIndex +
              1
            ) %
            100000;


          paintLiveMarket();

        },
        MARKET_JUMP_MS
      );
  }


  if (!blinkTimer) {

    blinkTimer =
      setInterval(
        blinkLiveNumbers,
        BLINK_INTERVAL_MS
      );
  }
}


function stopLiveMovement(){

  if (marketJumpTimer) {

    clearInterval(
      marketJumpTimer
    );

    marketJumpTimer =
      null;
  }


  if (blinkTimer) {

    clearInterval(
      blinkTimer
    );

    blinkTimer =
      null;
  }
}


// ============================================================
// FINAL ADMIN RESULT
// NUMBER DISAPPEARS -> RING -> FINAL
// ============================================================

function showFinalWithRing(
  data
){

  if (
    ringBusy ||
    !data ||
    !/^\\d{2}$/.test(
      data.result || ""
    )
  ) {
    return;
  }


  ringBusy =
    true;


  holdActive =
    true;


  stopLiveMovement();


  const digits =
    document.getElementById(
      "resultDigits"
    );


  const noResult =
    document.getElementById(
      "noResult"
    );


  const loader =
    document.getElementById(
      "resultLoader"
    );


  noResult.style.display =
    "none";


  digits.style.opacity =
    "0";


  setTimeout(
    function(){

      digits.style.display =
        "none";


      loader.classList.add(
        "show"
      );

    },
    220
  );


  setTimeout(
    function(){

      loader.classList.remove(
        "show"
      );


      document
        .getElementById(
          "digit1"
        )
        .textContent =
          data.result.charAt(
            0
          );


      document
        .getElementById(
          "digit2"
        )
        .textContent =
          data.result.charAt(
            1
          );


      digits.style.display =
        "flex";


      digits.style.opacity =
        "1";


      document
        .getElementById(
          "setValue"
        )
        .textContent =
          data.set ||
          "--";


      document
        .getElementById(
          "valueValue"
        )
        .textContent =
          data.value ||
          "--";


      activeHoldRound =
        data.round_time;


      ringBusy =
        false;

    },
    1200
  );
}


// ============================================================
// UPDATE ROUND CARDS
// ============================================================

function updateRoundCards(
  results
){

  if (!results) {
    return;
  }


  const ids = [
    "r1100",
    "r1300",
    "r1500",
    "r1700",
    "r1900",
    "r2100"
  ];


  for (
    const id
    of ids
  ) {

    const element =
      document.getElementById(
        id
      );


    if (element) {

      element.textContent =
        results[id] ||
        "--";
    }
  }
}


// ============================================================
// RENDER API STATE
// ============================================================

function renderState(
  data
){

  if (!data) {
    return;
  }


  serverBase =
    Number(
      data.serverNow
    ) ||
    Date.now();


  perfBase =
    performance.now();


  marketBase =
    data.market &&
    data.market.ok
      ? data.market
      : null;


  updateRoundCards(
    data.results
  );


  const newHold =
    Boolean(
      data.resultHold &&
      data.resultHold.active
    );


  // ========================================================
  // HOLD STARTED
  // ========================================================

  if (newHold) {

    const hold =
      data.resultHold;


    if (
      !holdActive ||
      activeHoldRound !==
        hold.round_time
    ) {

      showFinalWithRing(
        hold
      );

    } else {

      holdActive =
        true;


      stopLiveMovement();


      showBig2D(
        hold.result
      );


      document
        .getElementById(
          "setValue"
        )
        .textContent =
          hold.set ||
          "--";


      document
        .getElementById(
          "valueValue"
        )
        .textContent =
          hold.value ||
          "--";
    }

    return;
  }


  // ========================================================
  // 3 MIN HOLD FINISHED
  // ========================================================

  if (
    holdActive &&
    !newHold
  ) {

    holdActive =
      false;


    activeHoldRound =
      null;


    marketJumpIndex =
      0;


    startLiveMovement();

    return;
  }


  // ========================================================
  // NORMAL LIVE
  // ========================================================

  holdActive =
    false;


  startLiveMovement();
}


// ============================================================
// POLL LIVE API EVERY 2 SEC
// ============================================================

let loading =
  false;


async function loadLive(){

  if (loading) {
    return;
  }


  loading =
    true;


  try {

    const response =
      await fetch(
        "/api/live?t=" +
        Date.now(),
        {
          cache:
            "no-store"
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        "Live API error"
      );
    }


    renderState(
      data
    );

  } catch (error) {

    console.error(
      error
    );

  } finally {

    loading =
      false;
  }
}


loadLive();


apiTimer =
  setInterval(
    function(){

      if (
        document.visibilityState ===
        "visible"
      ) {
        loadLive();
      }

    },
    2000
  );


window.addEventListener(
  "focus",
  loadLive
);


window.addEventListener(
  "online",
  loadLive
);


document.addEventListener(
  "visibilitychange",
  function(){

    if (
      document.visibilityState ===
      "visible"
    ) {
      loadLive();
    }
  }
);

</script>

</body>

</html>`;
}


// ============================================================
// ADMIN LOGIN PAGE
// ============================================================

function adminLoginPage(
  message = ""
) {

  return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1.0">

<title>Brazil 2D Admin</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  background:#f0f5f2;
  font-family:Arial,Helvetica,sans-serif;
}

.page{
  width:100%;
  max-width:480px;
  min-height:100vh;
  margin:auto;

  display:flex;
  align-items:center;
  justify-content:center;

  padding:25px;
}

.card{
  width:100%;

  background:#fff;

  border-radius:25px;

  padding:32px 24px;

  box-shadow:
    0 8px 30px
    rgba(0,0,0,.10);
}

.logo{
  text-align:center;

  color:#109447;

  font-size:27px;

  font-weight:900;

  margin-bottom:8px;
}

.sub{
  text-align:center;

  color:#777;

  margin-bottom:28px;
}

.message{
  text-align:center;

  color:#d92727;

  font-weight:800;

  margin-bottom:18px;
}

label{
  display:block;

  font-weight:800;

  margin-bottom:8px;
}

input{
  width:100%;

  height:52px;

  border:
    1px solid
    #ccc;

  border-radius:12px;

  padding:0 14px;

  font-size:17px;
}

button{
  width:100%;

  height:54px;

  border:0;

  border-radius:14px;

  margin-top:20px;

  background:#109447;

  color:#fff;

  font-size:18px;

  font-weight:900;
}

.home{
  display:block;

  text-align:center;

  margin-top:20px;

  color:#0762a9;

  text-decoration:none;

  font-weight:800;
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


<button
type="submit"
>
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

async function adminPage(
  DB,
  requestedDate
) {

  const today =
    getMyanmarDate();


  const selectedDate =
    /^\\d{4}-\\d{2}-\\d{2}$/.test(
      requestedDate ||
      ""
    )
      ? requestedDate
      : today;


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
    .bind(
      selectedDate
    )
    .all();


  const rows =
    query.results ||
    [];


  const map =
    {};


  for (
    const row
    of rows
  ) {

    map[
      row.round_time
    ] =
      row;
  }


  return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1.0">

<title>Brazil 2D Admin</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background:#f3f6f4;
}

.admin{
  width:100%;

  max-width:500px;

  margin:auto;

  min-height:100vh;

  background:#fff;
}

.header{
  background:#109447;

  color:#fff;

  padding:22px;

  text-align:center;

  font-size:24px;

  font-weight:900;
}

.content{
  padding:22px;
}

label{
  display:block;

  font-weight:800;

  color:#333;

  margin:15px 0 7px;
}

input{
  width:100%;

  height:48px;

  padding:0 13px;

  border:
    1px solid
    #ccc;

  border-radius:10px;

  font-size:17px;
}

.grid{
  display:grid;

  grid-template-columns:
    1fr
    1fr;

  gap:12px;
}

.card{
  border:
    1px solid
    #ddd;

  border-radius:14px;

  padding:12px;
}

.card label{
  margin-top:0;

  color:#109447;
}

.save{
  width:100%;

  height:54px;

  margin-top:24px;

  border:0;

  border-radius:14px;

  background:#109447;

  color:#fff;

  font-size:18px;

  font-weight:900;
}

.links{
  display:flex;

  gap:10px;

  margin-top:20px;
}

.links a{
  flex:1;

  text-align:center;

  padding:14px 5px;

  border-radius:12px;

  text-decoration:none;

  font-weight:800;
}

.home{
  color:#0762a9;

  background:#edf6fc;
}

.logout{
  color:#c62828;

  background:#fff0f0;
}

.help{
  margin-top:10px;

  color:#777;

  font-size:13px;

  line-height:1.5;
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
id="resultDate"
value="${escapeHtml(selectedDate)}"
required
onchange="loadDate()"
>


<div class="help">

6 ကြိမ်လုံး 2D Result ကို ကြိုသတ်မှတ်နိုင်ပါတယ်။
အချိန်မရောက်ခင် User ဘက်မှာ Round Result ကို -- ပဲပြမယ်။

</div>


<label>
2D RESULTS
</label>


<div class="grid">


${ROUNDS.map(round => {

  const row =
    map[
      round.time
    ];


  return `

<div class="card">


<label>

${round.time}

</label>


<input
type="text"
name="${round.field}"
value="${
  row &&
  valid2D(
    row.result
  )
    ? escapeHtml(
        row.result
      )
    : ""
}"
maxlength="2"
inputmode="numeric"
placeholder="--"
>


</div>

`;

}).join("")}


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


<script>

function loadDate(){

  const date =
    document
      .getElementById(
        "resultDate"
      )
      .value;


  if (date) {

    window.location.href =
      "/admin?date=" +
      encodeURIComponent(
        date
      );
  }
}

</script>


</body>

</html>`;
}


// ============================================================
// SAVE ADMIN RESULTS
// ============================================================

async function saveResults(
  request,
  env
) {

  const form =
    await request.formData();


  const resultDate =
    String(
      form.get(
        "result_date"
      ) || ""
    ).trim();


  if (
    !/^\\d{4}-\\d{2}-\\d{2}$/.test(
      resultDate
    )
  ) {

    return new Response(
      "Invalid date",
      {
        status:400
      }
    );
  }


  for (
    const round
    of ROUNDS
  ) {

    const newResult =
      String(
        form.get(
          round.field
        ) || ""
      ).trim();


    if (
      newResult &&
      !valid2D(
        newResult
      )
    ) {

      return new Response(
        round.time +
        " result must be exactly 2 digits.",
        {
          status:400
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
        valid2D(
          existing.result
        )
          ? existing.result
          : "--"
      );


    await env.DB.prepare(`
      INSERT INTO results(
        result_date,
        round_time,
        result,
        set_value,
        market_value,
        updated_at
      )

      VALUES(
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

        result =
          excluded.result,

        updated_at =
          CURRENT_TIMESTAMP
    `)
      .bind(
        resultDate,
        round.time,
        finalResult,
        existing?.set_value ||
          null,
        existing?.market_value ||
          null
      )
      .run();
  }


  return Response.redirect(
    new URL(
      "/admin?date=" +
      encodeURIComponent(
        resultDate
      ),
      request.url
    ).toString(),
    303
  );
}


// ============================================================
// HISTORY
// DATE + 6 RESULTS ONLY
// ============================================================

async function historyPage(
  DB
) {

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

          WHEN '11:00 AM'
            THEN 1

          WHEN '01:00 PM'
            THEN 2

          WHEN '03:00 PM'
            THEN 3

          WHEN '05:00 PM'
            THEN 4

          WHEN '07:00 PM'
            THEN 5

          WHEN '09:00 PM'
            THEN 6

          ELSE 99

        END
    `)
    .all();


  const rows =
    query.results ||
    [];


  const grouped =
    {};


  for (
    const row
    of rows
  ) {

    if (
      !grouped[
        row.result_date
      ]
    ) {

      grouped[
        row.result_date
      ] =
        {};
    }


    if (
      valid2D(
        row.result
      )
    ) {

      grouped[
        row.result_date
      ][
        row.round_time
      ] =
        row.result;
    }
  }


  const historyHtml =
    Object
      .keys(grouped)
      .map(
        date => {

          const results =
            grouped[
              date
            ];


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
  results[
    round.time
  ] || "--"
)}

</div>


</div>

`).join("")}


</div>


</div>

`;
        }
      )
      .join("");


  return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1.0">

<title>Brazil 2D History</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background:#f2f6f3;

  color:#111;
}

.page{
  width:100%;

  max-width:480px;

  min-height:100vh;

  margin:auto;

  background:#fff;
}

.header{
  background:#109447;

  color:#fff;

  min-height:66px;

  display:flex;

  align-items:center;

  padding:0 18px;
}

.back{
  font-size:34px;

  margin-right:15px;

  cursor:pointer;
}

.title{
  font-size:20px;

  font-weight:900;
}

.content{
  padding:16px;
}

.day{
  margin-bottom:20px;

  background:#fff;

  border-radius:18px;

  box-shadow:
    0 4px 16px
    rgba(0,0,0,.08);

  padding:15px;
}

.date{
  color:#0864ac;

  font-size:19px;

  font-weight:900;

  margin-bottom:14px;
}

.rounds{
  display:grid;

  grid-template-columns:
    1fr
    1fr;

  gap:8px;
}

.round{
  border:1.5px solid;

  border-radius:12px;

  padding:10px;

  text-align:center;

  background:#fff;
}

.round.green{
  border-color:#109447;
}

.round.yellow{
  border-color:#e8c327;
}

.round.blue{
  border-color:#176caf;
}

.time{
  font-size:12px;

  font-weight:800;

  margin-bottom:5px;
}

.round.green .time{
  color:#109447;
}

.round.yellow .time{
  color:#e8b900;
}

.round.blue .time{
  color:#0762a9;
}

.number{
  font-size:27px;

  font-weight:900;

  color:#111;
}

.empty{
  text-align:center;

  color:#999;

  padding:80px 20px;
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
