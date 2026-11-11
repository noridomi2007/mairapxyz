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

function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] [${USERNAME}] ${message}`);
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

  function doLogin(source) {
    if (!bot) return;
    const now = Date.now();
    if (now - lastLoginTime < 2000) return;
    lastLoginTime = now;

    bot.chat(`/login ${PASSWORD}`);
    log(`[AUTO-LOGIN - ${source}] Đã gửi lệnh đăng nhập, bắt đầu đứng treo máy.`);
    hasLoggedIn = true;
  }

  // 1. Tự động đăng nhập sau 3 giây vào server rồi đứng yên tại chỗ
  bot.once("spawn", () => {
    log("Đã vào server thành công.");
    setTimeout(() => {
      if (!hasLoggedIn) doLogin("SPAWN");
    }, 3000);
  });

  // 2. Dự phòng: Tự nhập pass nếu server nhắc trên chat
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
      doLogin("CHAT");
    }
  });

  // 3. Tự hồi sinh nếu chết
  bot.on("death", () => {
    log("Bot bị chết, đang tự hồi sinh...");
    try { bot.respawn(); } catch (e) {}
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
    bot = null;

    if (!isReconnecting) {
      isReconnecting = true;
      setTimeout(() => createBot(), 7000);
    }
  });
}

createBot();