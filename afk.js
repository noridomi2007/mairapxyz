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

function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] [${USERNAME}] ${message}`);
}

function clearAllTimers() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}

function createBot() {
  if (bot) return;
  isReconnecting = false;

  log(`Đang kết nối tới ${SERVER_IP}:${SERVER_PORT} (Version: ${MINECRAFT_VERSION})...`);

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
    log(`Chuyển sang chế độ tự động nhận diện phiên bản (Auto-Version)...`);
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
  let hasWarped = false;
  let lastLoginTime = 0;

  function doLoginAndWarp(source) {
    if (!bot) return;
    const now = Date.now();
    if (now - lastLoginTime < 2000) return;
    lastLoginTime = now;

    bot.chat(`/login ${PASSWORD}`);
    log(`[AUTO-LOGIN - ${source}] Đã gửi lệnh: /login ${PASSWORD}`);
    hasLoggedIn = true;

    if (!hasWarped) {
      hasWarped = true;
      const warpTimer = setTimeout(() => {
        if (bot) {
          bot.chat("/warp afk");
          log("[AUTO-WARP] Đã gửi lệnh: /warp afk");
        }
      }, 3500);
      timers.push(warpTimer);
    }
  }

  // 1. Tự động đăng nhập & /warp afk sau khi vào server
  bot.once("spawn", () => {
    log("Đã kết nối vào server thành công.");

    const loginTimer = setTimeout(() => {
      if (!hasLoggedIn) {
        doLoginAndWarp("SPAWN");
      }
    }, 3000);
    timers.push(loginTimer);
  });

  // 2. Bắt thông báo chat phòng trường hợp server yêu cầu nhập lại /login
  bot.on("messagestr", (message) => {
    const msg = message.trim();
    if (!msg) return;

    console.log(`[CHAT] ${msg}`);
    const lower = msg.toLowerCase();

    if (
      lower.includes("/login") ||
      lower.includes("vui lòng đăng nhập") ||
      lower.includes("vui long dang nhap") ||
      lower.includes("chưa đăng nhập")
    ) {
      doLoginAndWarp("CHAT-PROMPT");
    }
  });

  // 3. Nếu lỡ bị chết thì tự hồi sinh và quay lại /warp afk
  bot.on("death", () => {
    log("Bot bị hạ gục! Đang hồi sinh và quay lại /warp afk...");
    try { bot.respawn(); } catch (e) {}

    const deathWarpTimer = setTimeout(() => {
      if (bot) {
        bot.chat("/warp afk");
        log("[AUTO-WARP] Đã gửi lại lệnh: /warp afk");
      }
    }, 3000);
    timers.push(deathWarpTimer);
  });

  // 4. Xử lý khi bị kick / mất kết nối và tự động vào lại sau 7 giây
  bot.on("kicked", (reason) => {
    const reasonStr = typeof reason === "object" ? JSON.stringify(reason) : reason;
    log(`Bị kick khỏi server: ${reasonStr}`);
  });

  bot.on("error", (err) => {
    log(`Lỗi hệ thống: ${err.message}`);
  });

  bot.on("end", (reason) => {
    log(`Đã mất kết nối (${reason || "Không rõ lý do"}).`);
    clearAllTimers();
    bot = null;

    if (!isReconnecting) {
      isReconnecting = true;
      log("Sẽ kết nối lại sau 7 giây...");
      setTimeout(() => createBot(), 7000);
    }
  });
}

createBot();