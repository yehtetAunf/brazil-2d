export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/history") {
      return new Response(historyPage(), {
        headers: {
          "Content-Type": "text/html; charset=UTF-8"
        }
      });
    }

    return new Response(mainPage(), {
      headers: {
        "Content-Type": "text/html; charset=UTF-8"
      }
    });
  }
};

function mainPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Brazil 2D</title>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
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

/* TOP HEADER */
.top-header {
  height: 72px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #e6e6e6;
  position: relative;
}

.top-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 29px;
  font-weight: 900;
  color: #109447;
}

.flag {
  font-size: 31px;
}

/* LIVE TITLE ROW */
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
  0%, 100% { opacity: 1; }
  50% { opacity: .35; }
}

/* HERO */
.hero {
  position: relative;
  text-align: center;
  padding: 25px 20px 70px;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 70%, rgba(16,148,71,.08), transparent 25%),
    radial-gradient(circle at 88% 68%, rgba(16,148,71,.08), transparent 22%),
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
  margin: 5px 0 30px;
}

.digit {
  font-size: clamp(128px, 37vw, 176px);
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
  width: calc(100% - 46px);
  margin: -36px auto 24px;
  background: #fff;
  border-radius: 24px;
  box-shadow: 0 5px 18px rgba(0,0,0,.13);
  display: flex;
  padding: 25px 8px;
}

.value-item {
  width: 50%;
  text-align: center;
  padding: 3px 10px;
}

.value-item:first-child {
  border-right: 1px solid #e4e4e4;
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

/* ROUNDS */
.round-grid {
  padding: 0 22px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 13px;
}

.round {
  height: 112px;
  border: 2px solid;
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
  padding: 26px 22px 70px;
  position: relative;
}

.history-btn {
  width: 100%;
  height: 72px;
  border: 2px solid #15994c;
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
  .top-title {
    font-size: 25px;
  }

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

  <header class="top-header">
    <div class="top-title">
      BRAZIL 2D
      <span class="flag">🇧🇷</span>
    </div>
  </header>

  <section class="live-header">
    <div class="brand">
      <span class="brand-brazil">BRAZIL</span>
      <span class="brand-2"> 2</span><span class="brand-d">D</span>
    </div>

    <div class="live-pill">
      <span class="live-dot"></span>
      2D LIVE NOW
    </div>
  </section>

  <section class="hero">
    <div class="hero-content">

      <div class="big-result">
        <span class="digit digit-one" id="digit1">0</span>
        <span class="digit digit-two" id="digit2">5</span>
      </div>

      <div class="date-time" id="dateTime">
        --/--/---- | --:--:-- --
      </div>

    </div>
  </section>

  <section class="value-card">

    <div class="value-item">
      <div class="value-label">SET VALUE</div>
      <div class="value-number" id="setValue">2,081.50</div>
    </div>

    <div class="value-item">
      <div class="value-label">MARKET VALUE</div>
      <div class="value-number" id="marketValue">69,135.01</div>
    </div>

  </section>

  <section class="round-grid">

    <div class="round green">
      <div class="round-time">11:00 AM</div>
      <div class="round-number" id="r1100">28</div>
    </div>

    <div class="round yellow">
      <div class="round-time">01:00 PM</div>
      <div class="round-number" id="r1300">34</div>
    </div>

    <div class="round blue">
      <div class="round-time">03:00 PM</div>
      <div class="round-number" id="r1500">77</div>
    </div>

    <div class="round green">
      <div class="round-time">05:00 PM</div>
      <div class="round-number" id="r1700">69</div>
    </div>

    <div class="round yellow">
      <div class="round-time">07:00 PM</div>
      <div class="round-number" id="r1900">--</div>
    </div>

    <div class="round blue">
      <div class="round-time">09:00 PM</div>
      <div class="round-number" id="r2100">--</div>
    </div>

  </section>

  <section class="bottom">
    <button class="history-btn"
      onclick="window.location.href='/history'">
      2D HISTORY
    </button>

    <div class="bottom-wave"></div>
  </section>

</div>

<script>
function updateClock() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(now);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Yangon",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(now);

  document.getElementById("dateTime").textContent =
    parts + " | " + time;
}

updateClock();
setInterval(updateClock, 1000);
</script>

</body>
</html>`;
}

function historyPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Brazil 2D History</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, Helvetica, sans-serif;
  background: #f3f7f4;
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
  height: 72px;
  display: flex;
  align-items: center;
  padding: 0 18px;
}

.back {
  font-size: 30px;
  margin-right: 18px;
  cursor: pointer;
}

.title {
  font-size: 22px;
  font-weight: 900;
}

.content {
  padding: 24px 18px;
}

.empty {
  margin-top: 70px;
  text-align: center;
  color: #999;
  font-size: 16px;
}
</style>
</head>

<body>
<div class="page">

  <div class="header">
    <div class="back" onclick="history.back()">‹</div>
    <div class="title">BRAZIL 2D HISTORY 🇧🇷</div>
  </div>

  <div class="content">
    <div class="empty">
      History data will appear here.
    </div>
  </div>

</div>
</body>
</html>`;
    }
