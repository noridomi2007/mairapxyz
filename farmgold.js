const mineflayer = require("mineflayer");

// ==================== CẤU HÌNH THÔNG TIN ====================
const SERVER_IP = "mairap.xyz";
const SERVER_PORT = 25565;
const MINECRAFT_VERSION = "26.1.2";

const USERNAME = "Noridomi2k7";
const PASSWORD = "8866802007";

// Chu kỳ cập nhật số tiền: 1 phút (60000 ms)
const MONEY_UPDATE_INTERVAL_MS = 60 * 1000;
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

// ==================== BỘ GIẢI MÃ NBT & CHỮ SMALL CAPS ====================

const IGNORED_NBT_KEYS = new Set([
  "color", "font", "bold", "italic", "underlined", "strikethrough", "obfuscated",
  "insertion", "clickEvent", "hoverEvent", "shadow_color", "background"
]);

function stripColor(str) {
  if (!str) return "";
  return str
    .replace(/§[0-9a-fk-orx]/gi, "")
    .replace(/&#[0-9a-f]{6}/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Chuyển đổi phông chữ Small Caps trên bảng của mairap.xyz (ᴛàɪ sảɴ -> tai san) để dễ nhận diện
const SMALL_CAPS_MAP = {
  "ᴀ": "a", "ʙ": "b", "ᴄ": "c", "ᴅ": "d", "ᴇ": "e", "ꜰ": "f", "ɢ": "g", "ʜ": "h",
  "ɪ": "i", "ᴊ": "j", "ᴋ": "k", "ʟ": "l", "ᴍ": "m", "ɴ": "n", "ᴏ": "o", "ᴘ": "p",
  "ǫ": "q", "ʀ": "r", "ꜱ": "s", "ᴛ": "t", "ᴜ": "u", "ᴠ": "v", "ᴡ": "w", "ʏ": "y", "ᴢ": "z"
};

function normalizeSearchText(str) {
  if (!str) return "";
  let s = stripColor(str).toLowerCase();
  s = s.replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ]/g, (ch) => SMALL_CAPS_MAP[ch] || ch);
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

// Bóc tách toàn bộ văn bản từ cây NBT 26.1.2 / ChatMessage / JSON
function extractRawText(node) {
  if (node === null || node === undefined) return "";
  if (typeof node === "number" || typeof node === "boolean") return "";

  if (typeof node === "string") {
    const trimmed = node.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return extractRawText(JSON.parse(trimmed));
      } catch {
        return node;
      }
    }
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((item) => extractRawText(item)).join("");
  }

  if (typeof node === "object") {
    if (typeof node.toMotd === "function") {
      try {
        const motd = node.toMotd();
        if (typeof motd === "string" && stripColor(motd).length > 0) {
          return motd;
        }
      } catch {}
    }

    if (typeof node.type === "string" && "value" in node && !("text" in node) && !("extra" in node)) {
      if (node.type === "string") {
        return typeof node.value === "string" ? node.value : "";
      }
      if (node.type === "list") {
        if (Array.isArray(node.value)) {
          return node.value.map((item) => extractRawText(item)).join("");
        }
        if (node.value && Array.isArray(node.value.value)) {
          return node.value.value.map((item) => extractRawText(item)).join("");
        }
        return "";
      }
      if (node.type === "compound") {
        return extractRawText(node.value);
      }
      return "";
    }

    let result = "";
    if ("json" in node && node.json) result += extractRawText(node.json);
    if ("" in node) result += extractRawText(node[""]);
    if ("text" in node) result += extractRawText(node.text);
    if ("translate" in node) result += extractRawText(node.translate);
    if ("with" in node) result += extractRawText(node.with);
    if ("extra" in node) result += extractRawText(node.extra);
    if ("value" in node && typeof node.value === "object") result += extractRawText(node.value);

    if (stripColor(result).length > 0) return result;

    for (const [key, val] of Object.entries(node)) {
      if (
        IGNORED_NBT_KEYS.has(key) ||
        key === "type" ||
        key === "json" ||
        key === "" ||
        key === "text" ||
        key === "translate" ||
        key === "with" ||
        key === "extra" ||
        key === "value"
      ) {
        continue;
      }
      if (typeof val === "object" || typeof val === "string") {
        result += extractRawText(val);
      }
    }
    return result;
  }

  return "";
}

// Thu thập toàn bộ các dòng trong bảng bên phải màn hình
function getAllScoreboardLines(bot, rawTeamsMap, rawScoresMap) {
  const lines = [];
  const addLine = (str) => {
    const clean = stripColor(str);
    if (clean.length > 1 && !lines.includes(clean)) {
      lines.push(clean);
    }
  };

  // 1. Từ bot.scoreboards của Mineflayer
  if (bot.scoreboards) {
    for (const sb of Object.values(bot.scoreboards)) {
      if (!sb || !sb.itemsMap) continue;
      for (const item of Object.values(sb.itemsMap)) {
        addLine(extractRawText(item.displayName) || item.name || "");
      }
    }
  }

  // 2. Từ bot.teams của Mineflayer
  if (bot.teams) {
    for (const team of Object.values(bot.teams)) {
      const p = extractRawText(team.prefix);
      const s = extractRawText(team.suffix);
      addLine(`${p}${s}`);
    }
  }

  // 3. Từ các gói tin scoreboard_score và teams bắt trực tiếp ở tầng protocol
  for (const val of rawScoresMap.values()) {
    addLine(val);
  }
  for (const val of rawTeamsMap.values()) {
    addLine(val);
  }

  return lines;
}

// ==================== LUỒNG CHÍNH CỦA BOT ====================

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

  const rawTeamsMap = new Map();
  const rawScoresMap = new Map();

  // Bắt trực tiếp gói tin điểm số (hỗ trợ cả chuẩn 1.20.3+ / 26.1.2)
  bot._client.on("scoreboard_score", (packet) => {
    if (!packet) return;
    const key = packet.itemName || packet.scoreName || "unknown";
    const rawDisplay =
      packet.display_name ||
      packet.displayName ||
      packet.itemName ||
      packet.scoreName ||
      "";
    const text = stripColor(extractRawText(rawDisplay));
    if (text) {
      rawScoresMap.set(key, text);
    }
  });

  // Bắt trực tiếp gói tin Team Prefix/Suffix (Nơi chứa dòng "TÀI SẢN: 89M" và "CAPSULE: 61K")
  bot._client.on("teams", (packet) => {
    if (!packet) return;
    const teamName = packet.team || packet.name || "unknown";
    const params = packet.parameters || packet;

    if (params.prefix !== undefined || params.suffix !== undefined) {
      const p = extractRawText(params.prefix);
      const s = extractRawText(params.suffix);
      const combined = stripColor(`${p}${s}`);
      if (combined) {
        rawTeamsMap.set(teamName, combined);
      }
    }
  });

  // Hàm quét và in số tiền ra màn hình Console
  function reportMoneyStatus() {
    if (!bot || !hasLoggedIn) return;

    const allLines = getAllScoreboardLines(bot, rawTeamsMap, rawScoresMap);

    let taiSanLine = null;
    let capsuleLine = null;
    let sucManhLine = null;

    for (const line of allLines) {
      const norm = normalizeSearchText(line);
      if (!taiSanLine && norm.includes("tai san")) {
        taiSanLine = line;
      } else if (!capsuleLine && norm.includes("capsule")) {
        capsuleLine = line;
      } else if (!sucManhLine && norm.includes("suc manh")) {
        sucManhLine = line;
      }
    }

    if (taiSanLine || capsuleLine) {
      const summary = [taiSanLine, capsuleLine, sucManhLine].filter(Boolean).join(" | ");
      log(`[CẬP NHẬT 1 PHÚT] ${summary}`);
    } else if (allLines.length > 0) {
      // Nếu bảng có chữ nhưng định dạng khác, in các dòng có chứa số của bảng ra để theo dõi
      log(`[BẢNG THÔNG TIN] ${allLines.join(" | ")}`);
    } else {
      log(`[THÔNG BÁO] Đang chờ server tải bảng thông tin bên phải...`);
    }
  }

  function doLogin(source) {
    if (!bot) return;
    const now = Date.now();
    if (now - lastLoginTime < 2000) return;
    lastLoginTime = now;

    bot.chat(`/login ${PASSWORD}`);
    log(`[AUTO-LOGIN - ${source}] Đã gửi lệnh đăng nhập, đứng yên tại chỗ.`);
    hasLoggedIn = true;

    // In số tiền lần đầu tiên sau khi đăng nhập 5 giây để bạn kiểm tra ngay
    const firstCheckTimer = setTimeout(() => {
      reportMoneyStatus();
    }, 5000);
    timers.push(firstCheckTimer);

    // Sau đó cứ đúng mỗi 1 phút (60 giây) sẽ tự động in cập nhật số tiền 1 lần
    if (!scoreboardInterval) {
      scoreboardInterval = setInterval(reportMoneyStatus, MONEY_UPDATE_INTERVAL_MS);
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

  // 2. Lắng nghe ngầm khung chat để tự nhập pass nếu server yêu cầu
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

  // 3. Tự hồi sinh nếu chết
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