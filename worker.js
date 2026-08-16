// ============================================================
// BRAZIL 2D — Cloudflare Worker + D1
// Crypto Live SET / VALUE + Live 2D
//
// 6 Rounds:
// 11:00 AM
// 01:00 PM
// 03:00 PM
// 05:00 PM
// 07:00 PM
// 09:00 PM
//
// Admin:
// Round ရွေး -> SET/VALUE ထည့် -> AUTO 2D
// -> Schedule Save
// -> Publish Now
// -> Undo Publish
//
// Final Result Hold = 3 Minutes
// ============================================================


const ROUNDS = [
  {
    time: "11:00 AM",
    minutes: 11 * 60,
    id: "r1100",
    color: "green"
  },
  {
    time: "01:00 PM",
    minutes: 13 * 60,
    id: "r1300",
    color: "yellow"
  },
  {
    time: "03:00 PM",
    minutes: 15 * 60,
    id: "r1500",
    color: "blue"
  },
  {
    time: "05:00 PM",
    minutes: 17 * 60,
    id: "r1700",
    color: "green"
  },
  {
    time: "07:00 PM",
    minutes: 19 * 60,
    id: "r1900",
    color: "yellow"
  },
  {
    time: "09:00 PM",
    minutes: 21 * 60,
    id: "r2100",
    color: "blue"
  }
];


const RESULT_HOLD_SECONDS = 180; // 3 minutes
const LIVE_REFRESH_MS = 10000;   // Crypto refresh 10 seconds


export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);


    try {

      if (!env.DB) {
        throw new Error(
          "D1 binding DB is missing."
        );
      }


      await ensurePublishTable(
        env.DB
      );


      // ======================================================
      // USER MAIN PAGE
      // ======================================================

      if (
        url.pathname === "/" &&
        request.method === "GET"
      ) {

        return html(
          await mainPage(
            env.DB
          )
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
          await getLiveState(
            env.DB
          )
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
          await historyPage(
            env.DB
          )
        );
      }


      // ======================================================
      // ADMIN
      // ======================================================

      if (
        url.pathname === "/admin" &&
        request.method === "GET"
      ) {

        if (
          !(await isAdmin(
            request,
            env
          ))
        ) {

          return html(
            adminLoginPage()
          );
        }


        return html(
          await adminPage(
            env.DB,
            url.searchParams.get("date"),
            url.searchParams.get("round"),
            url.searchParams.get("msg")
          )
        );
      }


      // ======================================================
      // LOGIN
      // ======================================================

      if (
        url.pathname === "/admin/login" &&
        request.method === "POST"
      ) {

        return adminLogin(
          request,
          env
        );
      }


      // ======================================================
      // LOGOUT
      // ======================================================

      if (
        url.pathname === "/admin/logout"
      ) {

        return new Response(
          null,
          {
            status: 302,

            headers: {

              Location:
                "/admin",

              "Set-Cookie":
                "brazil_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
            }
          }
        );
      }


      // ======================================================
      // SAVE SCHEDULE
      // ======================================================

      if (
        url.pathname === "/admin/save-schedule" &&
        request.method === "POST"
      ) {

        if (
          !(await isAdmin(
            request,
            env
          ))
        ) {

          return Response.redirect(
            new URL(
              "/admin",
              request.url
            ).toString(),
            303
          );
        }


        return saveSchedule(
          request,
          env
        );
      }


      // ======================================================
      // PUBLISH NOW
      // ======================================================

      if (
        url.pathname === "/admin/publish-now" &&
        request.method === "POST"
      ) {

        if (
          !(await isAdmin(
            request,
            env
          ))
        ) {

          return Response.redirect(
            new URL(
              "/admin",
              request.url
            ).toString(),
            303
          );
        }


        return publishNow(
          request,
          env
        );
      }


      // ======================================================
      // UNDO
      // ======================================================

      if (
        url.pathname === "/admin/undo-publish" &&
        request.method === "POST"
      ) {

        if (
          !(await isAdmin(
            request,
            env
          ))
        ) {

          return Response.redirect(
            new URL(
              "/admin",
              request.url
            ).toString(),
            303
          );
        }


        return undoPublish(
          request,
          env
        );
      }


      // ======================================================
      // SAVE OLD HISTORY
      // ======================================================

      if (
        url.pathname === "/admin/save-old-history" &&
        request.method === "POST"
      ) {

        if (
          !(await isAdmin(
            request,
            env
          ))
        ) {

          return Response.redirect(
            new URL(
              "/admin",
              request.url
            ).toString(),
            303
          );
        }


        return saveOldHistory(
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

      console.error(
        error
      );


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
// DATABASE SETUP
// ============================================================

async function ensurePublishTable(DB) {

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS publish_controls (

      result_date TEXT NOT NULL,

      round_time TEXT NOT NULL,

      auto_publish INTEGER
      NOT NULL
      DEFAULT 1,

      manual_publish INTEGER
      NOT NULL
      DEFAULT 0,

      suppressed INTEGER
      NOT NULL
      DEFAULT 0,

      published_at INTEGER,

      updated_at TEXT
      DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (
        result_date,
        round_time
      )
    )
  `).run();
}


// ============================================================
// RESPONSE HELPERS
// ============================================================

function html(
  content,
  status = 200
) {

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


function json(
  data,
  status = 200
) {

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


function escapeHtml(
  value = ""
) {

  return String(value)

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );
}


function valid2D(value) {

  return /^\d{2}$/.test(
    String(
      value ||
      ""
    )
  );
}


function validDate(value) {

  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(
      value ||
      ""
    )
  );
}


function validRound(time) {

  return ROUNDS.some(
    round =>
      round.time ===
      time
  );
}


function pad2(value) {

  return String(value)
    .padStart(
      2,
      "0"
    );
}


// ============================================================
// AUTO 2D
//
// SET = decimal/full number last digit
// VALUE = integer part last digit
//
// Example:
//
// SET   = 3456.78 -> 8
// VALUE = 67890.88 -> 0
//
// Result = 80
// ============================================================

function calculate2D(
  setValue,
  valueValue
) {

  const setDigits =
    String(
      setValue ||
      ""
    )
    .replace(
      /\D/g,
      ""
    );


  const valueInteger =
    String(
      valueValue ||
      ""
    )
    .split(".")[0]
    .replace(
      /\D/g,
      ""
    );


  if (
    !setDigits ||
    !valueInteger
  ) {

    return "";
  }


  return (
    setDigits.slice(-1) +
    valueInteger.slice(-1)
  );
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
    )
    .formatToParts(
      new Date()
    );


  const data = {};


  for (
    const part
    of parts
  ) {

    if (
      part.type !==
      "literal"
    ) {

      data[
        part.type
      ] =
        part.value;
    }
  }


  let hour =
    Number(
      data.hour
    );


  if (
    hour === 24
  ) {

    hour = 0;
  }


  return {

    year:
      Number(
        data.year
      ),

    month:
      Number(
        data.month
      ),

    day:
      Number(
        data.day
      ),

    hour,

    minute:
      Number(
        data.minute
      ),

    second:
      Number(
        data.second
      )
  };
}


function getMyanmarDate() {

  const p =
    getYangonParts();


  return (
    p.year +
    "-" +
    pad2(
      p.month
    ) +
    "-" +
    pad2(
      p.day
    )
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


function roundReleaseSeconds(
  round
) {

  return (
    round.minutes *
    60
  );
}


// ============================================================
// ADMIN SESSION
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

  let binary = "";


  for (
    const byte
    of new Uint8Array(
      buffer
    )
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
    ) ||
    "";


  for (
    const piece
    of cookie.split(";")
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


  return (
    data +
    "." +
    await createSignature(
      data,
      secret
    )
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
    pieces.length !== 2
  ) {

    return false;
  }


  if (
    Number(
      pieces[0]
    ) <
    Date.now()
  ) {

    return false;
  }


  const expected =
    await createSignature(
      pieces[0],
      env.ADMIN_PASSWORD
    );


  return (
    pieces[1] ===
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
      ) ||
      ""
    );


  if (
    !env.ADMIN_PASSWORD ||
    password !==
    env.ADMIN_PASSWORD
  ) {

    return html(
      adminLoginPage(
        "Password မှားနေပါတယ်။"
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
// CRYPTO LIVE API
//
// Coinbase BTC-USD
//
// SET   = Volume
// VALUE = Price
// ============================================================

async function fetchLiveMarket() {

  const endpoint =
    "https://api.exchange.coinbase.com/products/BTC-USD/ticker";


  try {

    const response =
      await fetch(
        endpoint,
        {
          headers: {

            Accept:
              "application/json",

            "User-Agent":
              "Brazil-2D/2.0"
          },

          cf: {

            cacheTtl:
              10,

            cacheEverything:
              true
          }
        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        "Crypto API HTTP " +
        response.status
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

      live2d:
        Number.isFinite(
          price
        ) &&
        Number.isFinite(
          volume
        )
          ? calculate2D(
              volume.toFixed(
                2
              ),
              price.toFixed(
                2
              )
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
      "Crypto API Error:",
      error
    );


    return {

      ok:
        false,

      set:
        "--",

      value:
        "--",

      live2d:
        "--",

      source:
        "Coinbase BTC-USD"
    };
  }
}


// ============================================================
// DATABASE READ
// ============================================================

async function getDayRows(
  DB,
  date
) {

  const query =
    await DB.prepare(`
      SELECT

        result_date,

        round_time,

        result,

        set_value,

        market_value,

        updated_at

      FROM results

      WHERE
        result_date = ?
    `)

    .bind(
      date
    )

    .all();


  return (
    query.results ||
    []
  );
}


async function getPublishRows(
  DB,
  date
) {

  const query =
    await DB.prepare(`
      SELECT

        result_date,

        round_time,

        auto_publish,

        manual_publish,

        suppressed,

        published_at,

        updated_at

      FROM publish_controls

      WHERE
        result_date = ?
    `)

    .bind(
      date
    )

    .all();


  return (
    query.results ||
    []
  );
}


// ============================================================
// LIVE STATE
// ============================================================

async function getLiveState(DB) {

  const today =
    getMyanmarDate();


  const nowSeconds =
    getCurrentSeconds();


  const rows =
    await getDayRows(
      DB,
      today
    );


  const controls =
    await getPublishRows(
      DB,
      today
    );


  const market =
    await fetchLiveMarket();


  const rowMap =
    new Map(
      rows.map(
        row => [
          row.round_time,
          row
        ]
      )
    );


  const controlMap =
    new Map(
      controls.map(
        row => [
          row.round_time,
          row
        ]
      )
    );


  const releasedResults =
    {};


  let resultHold =
    null;


  // ==========================================================
  // CHECK ALL 6 ROUNDS
  // ==========================================================

  for (
    const round
    of ROUNDS
  ) {

    const row =
      rowMap.get(
        round.time
      );


    const control =
      controlMap.get(
        round.time
      ) ||
      {
        auto_publish:
          1,

        manual_publish:
          0,

        suppressed:
          0,

        published_at:
          null
      };


    const release =
      roundReleaseSeconds(
        round
      );


    const autoPublished =
      Number(
        control.auto_publish
      ) === 1 &&
      nowSeconds >=
      release;


    const manualPublished =
      Number(
        control.manual_publish
      ) === 1;


    const suppressed =
      Number(
        control.suppressed
      ) === 1;


    const published =
      !suppressed &&
      Boolean(
        row &&
        valid2D(
          row.result
        )
      ) &&
      (
        autoPublished ||
        manualPublished
      );


    // ========================================================
    // BEFORE TIME => --
    // ========================================================

    if (!published) {

      releasedResults[
        round.id
      ] =
        "--";

      continue;
    }


    // ========================================================
    // PUBLISHED RESULT
    // ========================================================

    releasedResults[
      round.id
    ] =
      row.result;


    // ========================================================
    // 3 MINUTE HOLD
    // ========================================================

    let elapsed =
      null;


    if (
      manualPublished &&
      control.published_at
    ) {

      elapsed =
        Math.floor(
          Date.now() /
          1000
        ) -
        Number(
          control.published_at
        );

    } else if (
      autoPublished
    ) {

      elapsed =
        nowSeconds -
        release;
    }


    if (
      elapsed !== null &&
      elapsed >= 0 &&
      elapsed <
      RESULT_HOLD_SECONDS
    ) {

      if (
        !resultHold ||
        round.minutes >
        (
          ROUNDS.find(
            r =>
              r.time ===
              resultHold.round_time
          )?.minutes ||
          0
        )
      ) {

        resultHold = {

          active:
            true,

          round_time:
            round.time,

          result:
            row.result,

          set:
            row.set_value ||
            market.set,

          value:
            row.market_value ||
            market.value,

          elapsed_seconds:
            elapsed,

          seconds_remaining:
            RESULT_HOLD_SECONDS -
            elapsed
        };
      }
    }
  }


  // ==========================================================
  // NEXT ROUND
  // ==========================================================

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

    results:
      releasedResults
  };
}


// ============================================================
// USER PAGE
// ============================================================

async function mainPage(DB) {

  const state =
    await getLiveState(
      DB
    );


  const hold =
    state.resultHold;


  const initialResult =
    hold?.active
      ? hold.result
      : (
          valid2D(
            state.market.live2d
          )
            ? state.market.live2d
            : "--"
        );


  return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1,maximum-scale=1">

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


/* TOP */

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
}

.live-dot{
  display:inline-block;
  width:10px;
  height:10px;
  background:#08a34b;
  border-radius:50%;
  margin-right:6px;
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


/* HERO */

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

      transparent
      0 30%,

      rgba(
        23,
        156,
        79,
        .50
      )
      31% 52%,

      rgba(
        247,
        205,
        26,
        .80
      )
      53% 65%,

      rgba(
        16,
        101,
        179,
        .55
      )
      66% 100%
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


/* BIG 2D */

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

  transition:
    opacity .2s ease,
    transform .2s ease;
}


.digit{

  font-size:
    clamp(
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


/* LIVE CHANGE */

.live-change{

  animation:
    liveBlink
    .85s
    ease-in-out
    1;
}


@keyframes liveBlink{

  0%,
  100%{

    opacity:1;

    transform:
      scale(1);
  }

  45%{

    opacity:.20;

    transform:
      scale(.95);
  }

  70%{

    opacity:1;

    transform:
      scale(1.03);
  }
}


/* FINAL RING */

.result-loader{

  display:none;

  position:absolute;

  width:72px;

  height:72px;

  border-radius:50%;

  border:
    7px solid
    rgba(
      70,
      70,
      200,
      .12
    );

  border-top-color:
    #315fd4;

  border-right-color:
    #8b42db;

  border-bottom-color:
    #315fd4;

  animation:
    resultSpin
    .7s
    linear
    infinite;
}


.result-loader.show{
  display:block;
}


@keyframes resultSpin{

  from{
    transform:
      rotate(0);
  }

  to{
    transform:
      rotate(360deg);
  }
}


.date-time{

  color:#075ea8;

  font-size:15px;

  font-weight:900;

  white-space:nowrap;
}


/* SET / VALUE */

.value-card{

  position:relative;

  z-index:5;

  width:
    calc(
      100% - 36px
    );

  height:76px;

  margin:
    -28px
    auto
    12px;

  background:#fff;

  border-radius:20px;

  box-shadow:
    0
    5px
    16px
    rgba(
      0,
      0,
      0,
      .12
    );

  display:flex;

  align-items:center;

  padding:8px;
}


.value-item{

  width:50%;

  text-align:center;

  padding:
    2px
    8px;
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


/* ROUND CARDS */

.round-grid{

  padding:
    0
    18px;

  display:grid;

  grid-template-columns:
    repeat(
      2,
      1fr
    );

  gap:
    8px
    10px;
}


.round{

  height:73px;

  border:
    2px solid;

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


.round.green
.round-time{

  color:#109447;
}


.round.yellow
.round-time{

  color:#e8b900;
}


.round.blue
.round-time{

  color:#0762a9;
}


.round-number{

  color:#0a0a0a;

  font-size:29px;

  line-height:1;

  font-weight:900;
}


/* HISTORY */

.bottom{

  padding:
    11px
    18px
    38px;

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

      rgba(
        20,
        153,
        74,
        .75
      )
      0 25%,

      #ffdd16
      26% 54%,

      #0965b5
      55% 100%
    );
}


@media(
  max-height:700px
){

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


<div class="live-result-box">


<div
class="result-digits"
id="resultDigits"
${
  valid2D(
    initialResult
  )
    ? ""
    : 'style="display:none"'
}
>


<span
class="digit digit-one"
id="digit1"
>

${
  valid2D(
    initialResult
  )
    ? initialResult[0]
    : ""
}

</span>


<span
class="digit digit-two"
id="digit2"
>

${
  valid2D(
    initialResult
  )
    ? initialResult[1]
    : ""
}

</span>


</div>


<div
class="no-result"
id="noResult"
${
  valid2D(
    initialResult
  )
    ? 'style="display:none"'
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
    : escapeHtml(
        state.market.set
      )
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
    : escapeHtml(
        state.market.value
      )
}

</div>

</div>


</section>


<section class="round-grid">

${ROUNDS.map(
  round => `

<div
class="round ${round.color}"
>

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
  ] ||
  "--"
)}
</div>

</div>

`
).join("")}

</section>


<section class="bottom">

<button
class="history-btn"
onclick="location.href='/history'"
>
2D HISTORY
</button>

<div class="bottom-wave"></div>

</section>


</div>


<script>

const LIVE_REFRESH_MS =
  ${LIVE_REFRESH_MS};


let serverBase =
  ${Number(
    state.serverNow
  )};


let perfBase =
  performance.now();


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


let lastLive2D =
  ${
    JSON.stringify(
      valid2D(
        state.market.live2d
      )
        ? state.market.live2d
        : null
    )
  };


// ==========================================================
// CLOCK
// ==========================================================

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
    )
    .format(
      now
    );


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
    )
    .format(
      now
    );


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


// ==========================================================
// SHOW BIG 2D
// ==========================================================

function showBig2D(
  result
){

  if (
    !/^\\d{2}$/.test(
      result ||
      ""
    )
  ) {

    return;
  }


  const digits =
    document
      .getElementById(
        "resultDigits"
      );


  const no =
    document
      .getElementById(
        "noResult"
      );


  no.style.display =
    "none";


  digits.style.display =
    "flex";


  document
    .getElementById(
      "digit1"
    )
    .textContent =
      result[0];


  document
    .getElementById(
      "digit2"
    )
    .textContent =
      result[1];
}


// ==========================================================
// LIVE ANIMATION
// ==========================================================

function animateLiveChange(){

  if (
    holdActive
  ) {

    return;
  }


  const items = [

    document
      .getElementById(
        "resultDigits"
      ),

    document
      .getElementById(
        "setValue"
      ),

    document
      .getElementById(
        "valueValue"
      )
  ];


  items.forEach(
    item =>
      item.classList.remove(
        "live-change"
      )
  );


  void items[0].offsetWidth;


  items.forEach(
    item =>
      item.classList.add(
        "live-change"
      )
  );
}


// ==========================================================
// FINAL RESULT WITH RING
// ==========================================================

function showFinalWithRing(
  hold
){

  if (
    ringBusy ||
    !hold ||
    !/^\\d{2}$/.test(
      hold.result ||
      ""
    )
  ) {

    return;
  }


  ringBusy =
    true;


  holdActive =
    true;


  const digits =
    document
      .getElementById(
        "resultDigits"
      );


  const no =
    document
      .getElementById(
        "noResult"
      );


  const loader =
    document
      .getElementById(
        "resultLoader"
      );


  no.style.display =
    "none";


  digits.style.opacity =
    "0";


  setTimeout(
    function(){

      digits.style.display =
        "none";


      loader
        .classList
        .add(
          "show"
        );

    },
    220
  );


  setTimeout(
    function(){

      loader
        .classList
        .remove(
          "show"
        );


      document
        .getElementById(
          "digit1"
        )
        .textContent =
          hold.result[0];


      document
        .getElementById(
          "digit2"
        )
        .textContent =
          hold.result[1];


      digits.style.display =
        "flex";


      digits.style.opacity =
        "1";


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


      activeHoldRound =
        hold.round_time;


      ringBusy =
        false;

    },
    1200
  );
}


// ==========================================================
// ROUND CARDS
// ==========================================================

function updateRoundCards(
  results
){

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
      document
        .getElementById(
          id
        );


    if (element) {

      element.textContent =
        results?.[id] ||
        "--";
    }
  }
}


// ==========================================================
// RENDER LIVE DATA
// ==========================================================

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


  updateRoundCards(
    data.results
  );


  const newHold =
    Boolean(
      data.resultHold &&
      data.resultHold.active
    );


  // ========================================================
  // FINAL HOLD
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
  // HOLD FINISHED -> LIVE AGAIN
  // ========================================================

  if (
    holdActive &&
    !newHold
  ) {

    holdActive =
      false;


    activeHoldRound =
      null;
  }


  // ========================================================
  // CRYPTO LIVE
  // ========================================================

  if (
    !data.market ||
    !data.market.ok
  ) {

    return;
  }


  document
    .getElementById(
      "setValue"
    )
    .textContent =
      data.market.set;


  document
    .getElementById(
      "valueValue"
    )
    .textContent =
      data.market.value;


  if (
    /^\\d{2}$/.test(
      data.market.live2d ||
      ""
    )
  ) {

    if (
      data.market.live2d !==
      lastLive2D
    ) {

      showBig2D(
        data.market.live2d
      );


      animateLiveChange();


      lastLive2D =
        data.market.live2d;

    } else {

      showBig2D(
        data.market.live2d
      );
    }
  }
}


// ==========================================================
// FETCH LIVE API
// ==========================================================

let loading =
  false;


async function loadLive(){

  if (
    loading
  ) {

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


  } catch(error) {

    console.error(
      error
    );

  } finally {

    loading =
      false;
  }
}


loadLive();


setInterval(
  function(){

    if (
      document.visibilityState ===
      "visible"
    ) {

      loadLive();
    }

  },
  LIVE_REFRESH_MS
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
// ADMIN LOGIN
// ============================================================

function adminLoginPage(
  message = ""
) {

  return `<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>
Brazil 2D Admin
</title>


<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  background:#f0f5f2;
  font-family:Arial;
}

.page{

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

  padding:
    32px
    24px;

  box-shadow:
    0
    8px
    30px
    rgba(
      0,
      0,
      0,
      .1
    );
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

  padding:
    0
    14px;

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
//
// SINGLE SCHEDULE EDITOR
//
// Date
// Round
// SET
// VALUE
// Auto 2D
// Auto Publish
//
// Save Schedule
// Publish Now
// Undo Publish
//
// Schedule List Below
// ============================================================

async function adminPage(
  DB,
  requestedDate,
  requestedRound,
  message = ""
) {

  const today =
    getMyanmarDate();


  const selectedDate =
    validDate(
      requestedDate
    )
      ? requestedDate
      : today;


  const selectedRound =
    validRound(
      requestedRound
    )
      ? requestedRound
      : ROUNDS[0].time;


  const rows =
    await getDayRows(
      DB,
      selectedDate
    );


  const controls =
    await getPublishRows(
      DB,
      selectedDate
    );


  const rowMap =
    new Map(
      rows.map(
        row => [
          row.round_time,
          row
        ]
      )
    );


  const controlMap =
    new Map(
      controls.map(
        row => [
          row.round_time,
          row
        ]
      )
    );


  const selectedData =
    rowMap.get(
      selectedRound
    ) ||
    {};


  const selectedControl =
    controlMap.get(
      selectedRound
    ) ||
    {
      auto_publish:
        1,

      manual_publish:
        0,

      suppressed:
        0
    };


  const currentAuto =
    calculate2D(
      selectedData.set_value ||
      "",
      selectedData.market_value ||
      ""
    );


  const scheduleList =
    ROUNDS.map(
      round => {

        const row =
          rowMap.get(
            round.time
          );


        const control =
          controlMap.get(
            round.time
          );


        if (
          !row ||
          !valid2D(
            row.result
          )
        ) {

          return "";
        }


        let status =
          "Scheduled";


        if (
          Number(
            control?.suppressed
          ) === 1
        ) {

          status =
            "Undo";

        } else if (
          Number(
            control?.manual_publish
          ) === 1
        ) {

          status =
            "Published Now";

        } else if (
          Number(
            control?.auto_publish
          ) === 1
        ) {

          status =
            "Auto Publish";
        }


        return `

<div class="schedule-item">


<div class="schedule-time">
${round.time}
</div>


<div class="schedule-info">

<div>
SET:
<strong>
${escapeHtml(
  row.set_value ||
  "--"
)}
</strong>
</div>

<div>
VALUE:
<strong>
${escapeHtml(
  row.market_value ||
  "--"
)}
</strong>
</div>

<div>
2D:
<strong>
${escapeHtml(
  row.result
)}
</strong>
</div>

</div>


<div class="schedule-status">
${escapeHtml(status)}
</div>


<a
class="edit-btn"
href="/admin?date=${encodeURIComponent(selectedDate)}&round=${encodeURIComponent(round.time)}"
>
ပြန်ကြည့် / ပြင်
</a>


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
content="width=device-width,initial-scale=1">

<title>
Brazil 2D Admin
</title>


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

  background:
    #f3f6f4;
}


.admin{

  width:100%;

  max-width:560px;

  margin:auto;

  min-height:100vh;

  background:#fff;
}


.header{

  background:
    #109447;

  color:#fff;

  padding:20px;

  text-align:center;

  font-size:23px;

  font-weight:900;
}


.content{
  padding:18px;
}


.notice{

  padding:
    12px
    14px;

  margin-bottom:14px;

  border-radius:10px;

  background:
    #eef9f1;

  color:
    #0d7d3d;

  font-weight:800;

  line-height:1.5;
}


label{

  display:block;

  font-weight:800;

  color:#333;

  margin:
    12px
    0
    6px;
}


input,
select{

  width:100%;

  height:48px;

  padding:
    0
    12px;

  border:
    1px solid
    #ccc;

  border-radius:10px;

  font-size:16px;

  background:#fff;
}


.two-col{

  display:grid;

  grid-template-columns:
    1fr
    1fr;

  gap:10px;
}


.auto-result{

  height:65px;

  text-align:center;

  color:
    #109447;

  background:
    #f3fff7;

  font-size:34px;

  font-weight:900;
}


.switch-row{

  display:flex;

  align-items:center;

  gap:9px;

  margin-top:14px;

  font-weight:800;
}


.switch-row input{

  width:21px;

  height:21px;
}


.buttons{

  display:grid;

  grid-template-columns:
    1fr
    1fr
    1fr;

  gap:8px;

  margin-top:16px;
}


.buttons button{

  min-height:50px;

  border:0;

  border-radius:11px;

  color:#fff;

  padding:
    8px
    5px;

  font-size:14px;

  font-weight:900;
}


.save{
  background:#109447;
}


.publish{
  background:#176caf;
}


.undo{
  background:#c62828;
}


.hint{

  margin-top:8px;

  color:#777;

  font-size:13px;

  line-height:1.5;
}


.section-title{

  margin:
    28px
    0
    12px;

  padding-bottom:8px;

  border-bottom:
    2px solid
    #109447;

  color:#109447;

  font-size:19px;

  font-weight:900;
}


.schedule-item{

  margin-bottom:11px;

  padding:13px;

  border:
    1px solid
    #ddd;

  border-radius:14px;

  background:#fff;

  box-shadow:
    0
    2px
    8px
    rgba(
      0,
      0,
      0,
      .05
    );
}


.schedule-time{

  color:
    #0864ac;

  font-size:17px;

  font-weight:900;

  margin-bottom:8px;
}


.schedule-info{

  display:grid;

  grid-template-columns:
    repeat(
      3,
      1fr
    );

  gap:6px;

  font-size:12px;

  color:#666;
}


.schedule-info strong{

  display:block;

  margin-top:3px;

  color:#111;

  font-size:15px;
}


.schedule-status{

  display:inline-block;

  margin-top:10px;

  padding:
    5px
    9px;

  border-radius:15px;

  background:
    #e7f6ec;

  color:
    #078f40;

  font-size:11px;

  font-weight:900;
}


.edit-btn{

  display:block;

  margin-top:9px;

  padding:9px;

  text-align:center;

  border-radius:9px;

  background:
    #edf6fc;

  color:
    #0762a9;

  text-decoration:none;

  font-weight:800;
}


.empty{

  text-align:center;

  color:#999;

  padding:
    30px
    10px;
}


.links{

  display:flex;

  gap:10px;

  margin-top:20px;
}


.links a{

  flex:1;

  padding:13px;

  text-align:center;

  border-radius:10px;

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


@media(
  max-width:430px
){

  .two-col{

    grid-template-columns:
      1fr;
  }


  .buttons{

    grid-template-columns:
      1fr;
  }


  .schedule-info{

    grid-template-columns:
      1fr
      1fr
      1fr;
  }
}

</style>

</head>


<body>


<div class="admin">


<div class="header">

BRAZIL 2D ADMIN 🇧🇷

</div>


<div class="content">


${
  message
    ? `<div class="notice">${escapeHtml(message)}</div>`
    : ""
}


<form
id="scheduleForm"
method="POST"
action="/admin/save-schedule"
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
>


<label>
Round Time
</label>


<select
name="round_time"
id="roundTime"
required
>


${ROUNDS.map(
  round => `

<option
value="${round.time}"
${
  selectedRound ===
  round.time
    ? "selected"
    : ""
}
>
${round.time}
</option>

`
).join("")}


</select>


<div class="hint">

Round Time ရွေးပြီး SET / VALUE ထည့်ပါ။
2D Result ကို Auto တွက်ပေးပါမယ်။
Result ကို ထပ်ရိုက်စရာမလိုပါ။

</div>


<div class="two-col">


<div>

<label>
SET
</label>

<input
type="text"
name="set_value"
id="adminSet"
value="${escapeHtml(
  selectedData.set_value ||
  ""
)}"
placeholder="Example: 3456.78"
required
>

</div>


<div>

<label>
VALUE
</label>

<input
type="text"
name="market_value"
id="adminValue"
value="${escapeHtml(
  selectedData.market_value ||
  ""
)}"
placeholder="Example: 67890.88"
required
>

</div>


</div>


<label>
2D RESULT
</label>


<input
class="auto-result"
type="text"
id="auto2D"
name="result"
value="${escapeHtml(
  currentAuto ||
  ""
)}"
placeholder="--"
readonly
>


<div class="switch-row">

<input
type="checkbox"
name="auto_publish"
value="1"
${
  Number(
    selectedControl.auto_publish
  ) === 1
    ? "checked"
    : ""
}
>

<span>
Auto Publish
</span>

</div>


<div class="buttons">


<button
class="save"
type="submit"
formaction="/admin/save-schedule"
>

အချိန်သတ်မှတ် သိမ်းမည်

</button>


<button
class="publish"
type="submit"
formaction="/admin/publish-now"
>

ယခု ထုတ်မည်

</button>


<button
class="undo"
type="submit"
formaction="/admin/undo-publish"
formnovalidate
>

ပြန်ဖျက်မည်

</button>


</div>


</form>


<div class="section-title">

သတ်မှတ်ထားသော Result များ

</div>


${
  scheduleList ||
  `
  <div class="empty">
  ဒီနေ့အတွက် Schedule မသတ်မှတ်ရသေးပါ။
  </div>
  `
}



<!-- =========================================================
     ADD OLD HISTORY — 6 ROUNDS ONLY
========================================================= -->

<div
style="
  margin-top:30px;
  padding:18px;
  border:1px solid #e3e8ef;
  border-radius:20px;
  background:#ffffff;
"
>

<div
style="
  color:#0864ac;
  font-size:26px;
  font-weight:900;
  margin-bottom:18px;
"
>
Add Old History
</div>


<form
method="POST"
action="/admin/save-old-history"
>


<label>
History Date
</label>


<input
type="date"
name="history_date"
value="${escapeHtml(selectedDate)}"
required
>


<div
style="
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
  margin-top:14px;
"
>


${ROUNDS.map(round => `

<div
style="
  background:#f4f7fb;
  border-radius:16px;
  padding:13px;
  text-align:center;
"
>

<div
style="
  color:#111;
  font-size:16px;
  font-weight:900;
  margin-bottom:10px;
"
>
${round.time}
</div>


<input
type="text"
name="old_${round.id}"
maxlength="2"
inputmode="numeric"
placeholder="--"
style="
  text-align:center;
  font-size:24px;
  font-weight:900;
"
>


</div>

`).join("")}


</div>


<button
type="submit"
style="
  width:100%;
  min-height:54px;
  margin-top:16px;
  border:0;
  border-radius:14px;
  background:#f28500;
  color:#fff;
  font-size:18px;
  font-weight:900;
"
>
Save Old History
</button>


</form>

</div>

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


function calculateAuto2D(){

  const setValue =
    document
      .getElementById(
        "adminSet"
      )
      .value;


  const valueValue =
    document
      .getElementById(
        "adminValue"
      )
      .value;


  const setDigits =
    String(
      setValue ||
      ""
    )
    .replace(
      /\\D/g,
      ""
    );


  const valueInteger =
    String(
      valueValue ||
      ""
    )
    .split(".")[0]
    .replace(
      /\\D/g,
      ""
    );


  let result =
    "";


  if (
    setDigits &&
    valueInteger
  ) {

    result =
      setDigits.slice(-1) +
      valueInteger.slice(-1);
  }


  document
    .getElementById(
      "auto2D"
    )
    .value =
      result ||
      "--";
}


document
  .getElementById(
    "adminSet"
  )
  .addEventListener(
    "input",
    calculateAuto2D
  );


document
  .getElementById(
    "adminValue"
  )
  .addEventListener(
    "input",
    calculateAuto2D
  );


calculateAuto2D();


// Change round -> reload saved data

document
  .getElementById(
    "roundTime"
  )
  .addEventListener(
    "change",
    function(){

      const date =
        document
          .getElementById(
            "resultDate"
          )
          .value;


      const round =
        this.value;


      location.href =
        "/admin?date=" +
        encodeURIComponent(
          date
        ) +
        "&round=" +
        encodeURIComponent(
          round
        );
    }
  );


// Change date -> reload date

document
  .getElementById(
    "resultDate"
  )
  .addEventListener(
    "change",
    function(){

      const round =
        document
          .getElementById(
            "roundTime"
          )
          .value;


      location.href =
        "/admin?date=" +
        encodeURIComponent(
          this.value
        ) +
        "&round=" +
        encodeURIComponent(
          round
        );
    }
  );

</script>


</body>

</html>`;
}


// ============================================================
// READ ADMIN FORM
// ============================================================

async function readScheduleForm(
  request
) {

  const form =
    await request.formData();


  return {

    resultDate:
      String(
        form.get(
          "result_date"
        ) ||
        ""
      ).trim(),

    roundTime:
      String(
        form.get(
          "round_time"
        ) ||
        ""
      ).trim(),

    setValue:
      String(
        form.get(
          "set_value"
        ) ||
        ""
      ).trim(),

    marketValue:
      String(
        form.get(
          "market_value"
        ) ||
        ""
      ).trim(),

    autoPublish:
      form.get(
        "auto_publish"
      )
        ? 1
        : 0
  };
}


// ============================================================
// SAVE RESULT DATA
// ============================================================

async function upsertScheduleResult(
  DB,
  data
) {

  if (
    !validDate(
      data.resultDate
    )
  ) {

    throw new Error(
      "Invalid date"
    );
  }


  if (
    !validRound(
      data.roundTime
    )
  ) {

    throw new Error(
      "Invalid round time"
    );
  }


  const result =
    calculate2D(
      data.setValue,
      data.marketValue
    );


  if (
    !valid2D(
      result
    )
  ) {

    throw new Error(
      "SET / VALUE မှ 2D Result မတွက်နိုင်ပါ။"
    );
  }


  await DB.prepare(`
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

      result =
        excluded.result,

      set_value =
        excluded.set_value,

      market_value =
        excluded.market_value,

      updated_at =
        CURRENT_TIMESTAMP
  `)

  .bind(

    data.resultDate,

    data.roundTime,

    result,

    data.setValue,

    data.marketValue
  )

  .run();


  return result;
}


// ============================================================
// SAVE SCHEDULE
// ============================================================

async function saveSchedule(
  request,
  env
) {

  try {

    const data =
      await readScheduleForm(
        request
      );


    const result =
      await upsertScheduleResult(
        env.DB,
        data
      );


    await env.DB.prepare(`
      INSERT INTO publish_controls (

        result_date,

        round_time,

        auto_publish,

        manual_publish,

        suppressed,

        published_at,

        updated_at
      )

      VALUES (
        ?,
        ?,
        ?,
        0,
        0,
        NULL,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(
        result_date,
        round_time
      )

      DO UPDATE SET

        auto_publish =
          excluded.auto_publish,

        manual_publish =
          0,

        suppressed =
          0,

        published_at =
          NULL,

        updated_at =
          CURRENT_TIMESTAMP
    `)

    .bind(

      data.resultDate,

      data.roundTime,

      data.autoPublish
    )

    .run();


    return adminRedirect(
      request,

      data.resultDate,

      data.roundTime,

      "အချိန်သတ်မှတ် သိမ်းပြီးပါပြီ — " +
      data.roundTime +
      " → " +
      result
    );


  } catch(error) {

    return new Response(
      error.message,
      {
        status: 400,

        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8"
        }
      }
    );
  }
}


// ============================================================
// PUBLISH NOW
//
// SET/VALUE ရိုက်ပြီး Publish Now တန်းနှိပ်လည်း
// Result ကို အရင် Save လုပ်ပေးမယ်
// ============================================================

async function publishNow(
  request,
  env
) {

  try {

    const data =
      await readScheduleForm(
        request
      );


    const result =
      await upsertScheduleResult(
        env.DB,
        data
      );


    const nowUnix =
      Math.floor(
        Date.now() /
        1000
      );


    await env.DB.prepare(`
      INSERT INTO publish_controls (

        result_date,

        round_time,

        auto_publish,

        manual_publish,

        suppressed,

        published_at,

        updated_at
      )

      VALUES (
        ?,
        ?,
        ?,
        1,
        0,
        ?,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(
        result_date,
        round_time
      )

      DO UPDATE SET

        auto_publish =
          excluded.auto_publish,

        manual_publish =
          1,

        suppressed =
          0,

        published_at =
          excluded.published_at,

        updated_at =
          CURRENT_TIMESTAMP
    `)

    .bind(

      data.resultDate,

      data.roundTime,

      data.autoPublish,

      nowUnix
    )

    .run();


    return adminRedirect(
      request,

      data.resultDate,

      data.roundTime,

      "ယခု ထုတ်ပြီးပါပြီ — " +
      data.roundTime +
      " → " +
      result
    );


  } catch(error) {

    return new Response(
      error.message,
      {
        status: 400,

        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8"
        }
      }
    );
  }
}


// ============================================================
// UNDO PUBLISH
// ============================================================

async function undoPublish(
  request,
  env
) {

  const form =
    await request.formData();


  const resultDate =
    String(
      form.get(
        "result_date"
      ) ||
      ""
    ).trim();


  const roundTime =
    String(
      form.get(
        "round_time"
      ) ||
      ""
    ).trim();


  if (
    !validDate(
      resultDate
    ) ||
    !validRound(
      roundTime
    )
  ) {

    return new Response(
      "Invalid request",
      {
        status: 400
      }
    );
  }


  await env.DB.prepare(`
    INSERT INTO publish_controls (

      result_date,

      round_time,

      auto_publish,

      manual_publish,

      suppressed,

      published_at,

      updated_at
    )

    VALUES (
      ?,
      ?,
      0,
      0,
      1,
      NULL,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(
      result_date,
      round_time
    )

    DO UPDATE SET

      auto_publish =
        0,

      manual_publish =
        0,

      suppressed =
        1,

      published_at =
        NULL,

      updated_at =
        CURRENT_TIMESTAMP
  `)

  .bind(
    resultDate,
    roundTime
  )

  .run();


  return adminRedirect(
    request,

    resultDate,

    roundTime,

    "Publish ပြန်ဖျက်ပြီးပါပြီ — " +
    roundTime
  );
}


// ============================================================
// ADMIN REDIRECT
// ============================================================

function adminRedirect(
  request,
  date,
  round,
  message
) {

  const url =
    new URL(
      "/admin",
      request.url
    );


  url.searchParams.set(
    "date",
    date
  );


  url.searchParams.set(
    "round",
    round
  );


  url.searchParams.set(
    "msg",
    message
  );


  return Response.redirect(
    url.toString(),
    303
  );
}



// ============================================================
// SAVE OLD HISTORY
// 6 Rounds only: 11AM / 1PM / 3PM / 5PM / 7PM / 9PM
// ============================================================

async function saveOldHistory(
  request,
  env
) {

  const form =
    await request.formData();


  const historyDate =
    String(
      form.get(
        "history_date"
      ) ||
      ""
    ).trim();


  if (
    !validDate(
      historyDate
    )
  ) {

    return new Response(
      "Invalid history date",
      {
        status: 400,
        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8"
        }
      }
    );
  }


  let savedCount = 0;


  for (
    const round
    of ROUNDS
  ) {

    const result =
      String(
        form.get(
          "old_" +
          round.id
        ) ||
        ""
      ).trim();


    if (!result) {
      continue;
    }


    if (
      !valid2D(
        result
      )
    ) {

      return new Response(
        round.time +
        " result must be exactly 2 digits.",
        {
          status: 400,
          headers: {
            "Content-Type":
              "text/plain; charset=UTF-8"
          }
        }
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

      VALUES (
        ?,
        ?,
        ?,
        NULL,
        NULL,
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
      historyDate,
      round.time,
      result
    )

    .run();


    savedCount++;
  }


  const url =
    new URL(
      "/admin",
      request.url
    );


  url.searchParams.set(
    "date",
    historyDate
  );


  url.searchParams.set(
    "msg",
    savedCount > 0
      ? "Old History သိမ်းပြီးပါပြီ — " +
        savedCount +
        " ကြိမ်"
      : "Old History Result မထည့်ရသေးပါ။"
  );


  return Response.redirect(
    url.toString(),
    303
  );
}


// ============================================================
// HISTORY
//
// Date + 6 Results only
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


  const grouped =
    {};


  for (
    const row
    of query.results ||
    []
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


  const cards =
    Object
      .keys(
        grouped
      )
      .map(
        date => `

<div class="day">


<div class="date">

${escapeHtml(date)}

</div>


<div class="rounds">


${ROUNDS.map(
  round => `

<div
class="round ${round.color}"
>


<div class="time">

${round.time}

</div>


<div class="number">

${escapeHtml(
  grouped[
    date
  ][
    round.time
  ] ||
  "--"
)}

</div>


</div>

`
).join("")}


</div>


</div>

`
      )
      .join("");


  return `<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>
Brazil 2D History
</title>


<style>

*{
  box-sizing:border-box;
}

body{

  margin:0;

  font-family:Arial;

  background:#f2f6f3;

  color:#111;
}

.page{

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

  padding:
    0
    18px;
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
    0
    4px
    16px
    rgba(
      0,
      0,
      0,
      .08
    );

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

  border:
    1.5px solid;

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
}

.empty{

  text-align:center;

  color:#999;

  padding:
    80px
    20px;
}

</style>

</head>


<body>


<div class="page">


<div class="header">


<div
class="back"
onclick="location.href='/'"
>

‹

</div>


<div class="title">

BRAZIL 2D HISTORY 🇧🇷

</div>


</div>


<div class="content">


${
  cards ||
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
