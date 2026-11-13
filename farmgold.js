const mineflayer = require("mineflayer");

// ==================== CẤU HÌNH THÔNG TIN ====================
const SERVER_IP = "mairap.xyz";
const SERVER_PORT = 25565;
const MINECRAFT_VERSION = "26.1.2";

const USERNAME = "Noridomi2k7";
const PASSWORD = "8866802007";
// ============================================================

let bot = null;
let isReconnecting = false;
let timers = [];
let scoreboardInterval = null;

function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] [${USERNAME}] ${message}`);
}

function clearAllTimers() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
  if (scoreboardInterval) {
    clearInterval(scoreboardInterval);
    scoreboardInterval = null;
  }
}

function stripColor(str) {
  if (!str) return "";
  return str
    .replace(/§[0-9a-fk-orx]/gi, "")
    .replace(/&#[0-9a-f]{6}/gi, "")
    .trim();
}

function extractText(val) {
  if (!val) return "";
  if (typeof val === "string") {
    try {
      if (val.startsWith("{") || val.startsWith("[")) {
        return extractText(JSON.parse(val));
      }
    } catch {}
    return val;
  }
  if (typeof val.toString === "function" && val.toString() !== "[object Object]") {
    return val.toString();
  }
  if (typeof val.toMotd === "function") {
    try { return val.toMotd(); } catch {}
  }
  if (typeof val === "object") {
    if (val.type === "string" && typeof val.value === "string") return val.value;
    if (val.type === "compound" && val.value) return extractText(val.value);
    let res = "";
    if (val[""]) res += extractText(val[""]);
    if (val.text) res += extractText(val.text);
    if (Array.isArray(val.extra)) res += val.extra.map(extractText).join("");
    return res;
  }
  return "";
}

function getSidebarLines(bot) {
  const lines = [];

  if (bot.scoreboards) {
    for (const sb of Object.values(bot.scoreboards)) {
      if (!sb || !sb.itemsMap) continue;
      for (const item of Object.values(bot.scoreboards ? sb.itemsMap : {})) {
        const raw = extractText(item.displayName) || item.name || "";
        const clean = stripColor(raw);
        if (clean) lines.push(clean);
      }
    }
  }

  if (bot.teams) {
    for (const team of Object.values(bot.teams)) {
      const prefix = extractText(team.prefix);
      const suffix = extractText(team.suffix);
      const combined = stripColor(`${prefix}${suffix}`);
      if (combined && !lines.includes(combined)) {
        lines.push(combined);
      }
    }
  }

  return lines;
}

function createBot() {
  if (bot) return;
  isReconnecting = false;

  log(`Đang kết nối tới ${SERVER_IP}:${SERVER_PORT}...`);

  try {
    bot = mineflayer.createBot({
      host: SERVER_IP,
      port: SERVER_PORT,
      username: USERNAME,
      version: MINECRAFT_VERSION === "auto" ? false : MINECRAFT_VERSION,
      auth: "offline",
      hideErrors: true
    });
  } catch (err) {
    bot = mineflayer.createBot({
      host: SERVER_IP,
      port: SERVER_PORT,
      username: USERNAME,
      version: false,
      auth: "offline",
      hideErrors: true
    });
  }

  let hasLoggedIn = false;
  let lastLoginTime = 0;
  let lastMoneyState = "";

  const rawPacketLines = new Map();

  bot._client.on("scoreboard_score", (packet) => {
    if (packet && packet.itemName) {
      const display = packet.display_name ? extractText(packet.display_name) : packet.itemName;
      const clean = stripColor(display);
      if (clean) rawPacketLines.set(`score_${packet.itemName}`, clean);
    }
  });

  bot._client.on("teams", (packet) => {
    if (packet && (packet.prefix !== undefined || packet.suffix !== undefined)) {
      const p = extractText(packet.prefix);
      const s = extractText(packet.suffix);
      const clean = stripColor(`${p}${s}`);
      if (clean) rawPacketLines.set(`team_${packet.team}`, clean);
    }
  });

  function checkAndLogMoney() {
    if (!bot || !hasLoggedIn) return;

    const allLines = [
      ...getSidebarLines(bot),
      ...Array.from(rawPacketLines.values())
    ];

    const taiSanLine = allLines.find((line) => /t[aà]i\s*s[aả]n\s*:/i.test(line));
    const capsuleLine = allLines.find((line) => /capsule\s*:/i.test(line));

    if (taiSanLine || capsuleLine) {
      const currentMoneyState = [taiSanLine, capsuleLine].filter(Boolean).join(" | ");
      if (currentMoneyState !== lastMoneyState) {
        lastMoneyState = currentMoneyState;
        log(`[CẬP NHẬT SỐ DƯ] ${currentMoneyState}`);
      }
    }
  }

  function doLogin(source) {
    if (!bot) return;
    const now = Date.now();
    if (now - lastLoginTime < 2000) return;
    lastLoginTime = now;

    bot.chat(`/login ${PASSWORD}`);
    log(`[AUTO-LOGIN - ${source}] Đã gửi lệnh đăng nhập, bắt đầu đứng yên treo máy.`);
    hasLoggedIn = true;

    if (!scoreboardInterval) {
      scoreboardInterval = setInterval(checkAndLogMoney, 2000);
    }
  }

  // 1. Tự động đăng nhập sau 3 giây vào server rồi đứng yên
  bot.once("spawn", () => {
    log("Đã vào server thành công.");
    const loginTimer = setTimeout(() => {
      if (!hasLoggedIn) doLogin("SPAWN");
    }, 3000);
    timers.push(loginTimer);
  });

  // 2. Chỉ lắng nghe ngầm khung chat để tự nhập pass nếu server yêu cầu
  bot.on("messagestr", (message) => {
    const lower = message.trim().toLowerCase();
    if (!lower) return;

    if (
      lower.includes("/login") ||
      lower.includes("vui lòng đăng nhập") ||
      lower.includes("vui long dang nhap") ||
      lower.includes("chưa đăng nhập")
    ) {
      doLogin("CHAT");
    }
  });

  // 3. Tự hồi sinh nếu chết (không gõ lệnh dịch chuyển)
  bot.on("death", () => {
    log("Bot bị chết! Đang tự hồi sinh...");
    try {
      bot.respawn();
    } catch (e) {}
  });

  // 4. Tự động kết nối lại sau 7 giây nếu bị văng
  bot.on("kicked", (reason) => {
    const reasonStr = typeof reason === "object" ? JSON.stringify(reason) : reason;
    log(`Bị kick: ${reasonStr}`);
  });

  bot.on("error", (err) => {
    log(`Lỗi: ${err.message}`);
  });

  bot.on("end", (reason) => {
    log(`Mất kết nối (${reason || "Không rõ"}). Kết nối lại sau 7 giây...`);
    clearAllTimers();
    bot = null;

    if (!isReconnecting) {
      isReconnecting = true;
      setTimeout(() => createBot(), 7000);
    }
  });
}

createBot();