const mineflayer = require("mineflayer");

// ==================== CẤU HÌNH THÔNG TIN ====================
const SERVER_IP = "mairap.xyz";
const SERVER_PORT = 25565;
const MINECRAFT_VERSION = "26.1.2";

// Điền tên nick và mật khẩu bạn muốn treo ở bãi Yakon
// (Nếu dùng nick sexkoche1 hoặc sexkoche2 thì đổi PASSWORD thành "nhinconcacne")
const USERNAME = "Noridomi2k7";
const PASSWORD = "8866802007";

const TARGET_HOME = "/home yakon";
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

  // Hàm thực hiện lệnh: /home yakon
  function goHome(reasonStr) {
    if (!bot) return;

    log(`[${reasonStr}] Đang gửi lệnh: ${TARGET_HOME}`);
    bot.chat(TARGET_HOME);
  }

  // Hàm tự động đăng nhập và kích hoạt về home lần đầu
  function doLogin(source) {
    if (!bot) return;
    const now = Date.now();
    if (now - lastLoginTime < 2000) return;
    lastLoginTime = now;

    bot.chat(`/login ${PASSWORD}`);
    log(`[AUTO-LOGIN - ${source}] Đã gửi lệnh đăng nhập.`);
    hasLoggedIn = true;

    // Chờ 3.5 giây sau khi đăng nhập rồi thực hiện /home yakon
    const initHomeTimer = setTimeout(() => {
      goHome("SAU ĐĂNG NHẬP");
    }, 3500);
    timers.push(initHomeTimer);
  }

  // 1. Tự động đăng nhập ngay khi vào server
  bot.once("spawn", () => {
    log("Đã vào server thành công.");
    const loginTimer = setTimeout(() => {
      if (!hasLoggedIn) doLogin("SPAWN");
    }, 3000);
    timers.push(loginTimer);
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

  // 3. Khi chết: Tự hồi sinh -> Chờ 3s -> /home yakon
  bot.on("death", () => {
    log("Bot đã bị chết! Đang hồi sinh và chuẩn bị quay lại /home yakon...");
    try {
      bot.respawn();
    } catch (e) {}

    const respawnHomeTimer = setTimeout(() => {
      if (bot && hasLoggedIn) {
        goHome("HỒI SINH");
      }
    }, 3000);
    timers.push(respawnHomeTimer);
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
    log(`Mất kết nối (${reason || "Không rõ"}). Sẽ kết nối lại sau 7 giây...`);
    clearAllTimers();
    bot = null;

    if (!isReconnecting) {
      isReconnecting = true;
      setTimeout(() => createBot(), 7000);
    }
  });
}

createBot();