const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const puppeteer = require("puppeteer-core");
const Store = require("electron-store");

const store = new Store();
let mainWindow;
let browser;
let isSharing = false;
let shouldStopSharing = false;

// 获取 Chrome 可执行文件路径
function getChromePath() {
  switch (process.platform) {
    case "win32":
      return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    case "darwin":
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    case "linux":
      return "/usr/bin/google-chrome";
    default:
      throw new Error("不支持的操作系统");
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    fullscreen: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 处理开始分享请求
ipcMain.on("start-sharing", async (event) => {
  if (isSharing) {
    event.reply("status-update", "已有分享任务正在进行中");
    return;
  }

  try {
    isSharing = true;
    event.reply("status-update", "正在启动浏览器...");

    // 保存当前配置到 store
    // store.set("currentLinks", links);
    // store.set("currentInterval", interval);

    const chromePath = getChromePath();
    event.reply("status-update", "正在连接Chrome浏览器...");

    browser = await puppeteer.launch({
      headless: false,
      executablePath: chromePath,
      defaultViewport: null,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920,1080",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
      timeout: 60000,
    });

    const page = await browser.newPage();
    const { width, height } = await page.evaluate(() => {
      return {
        width: window.screen.width,
        height: window.screen.height,
      };
    });

    // 设置页面超时和视窗大小
    await page.setViewport({ width, height });
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);

    // 设置用户代理
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // 监听页面的console消息
    page.on("console", (msg) => console.log("浏览器页面日志:", msg.text()));

    // 先访问微博登录页
    event.reply("status-update", "正在打开微博登录页...");
    await page.goto("https://passport.weibo.com/sso/signin", {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    event.reply(
      "status-update",
      '请在浏览器中完成登录，然后点击"开始分享"按钮'
    );
    event.reply("wait-for-login");
  } catch (error) {
    console.error("启动失败:", error);
    event.reply("status-update", "启动失败: " + error.message);
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("关闭浏览器失败:", closeError);
      }
    }
    isSharing = false;
  }
});

// 处理登录确认
ipcMain.on("login-confirmed", async (event, { links, interval }) => {
  let currentIndex = store.get("currentIndex") || 0;
  try {
    const page = (await browser.pages())[0];
    shouldStopSharing = false;
    isSharing = true;

    for (const link of links.slice(currentIndex)) {
      if (shouldStopSharing) {
        event.reply("status-update", "分享任务已停止");
        break;
      }

      currentIndex++;
      event.reply(
        "status-update",
        `正在处理第 ${currentIndex}/${links.length} 个链接`
      );

      try {
        await page.goto(link, {
          waitUntil: "networkidle0",
          timeout: 60000,
        });

        try {
          await page.waitForSelector(".element_share", {
            visible: true,
            timeout: 30000,
          });

          await page.evaluate(() => {
            const elementShare = document.querySelector(".element_share");
            if (elementShare) elementShare.click();
          });

          await new Promise((resolve) => setTimeout(resolve, 2000));

          event.reply(
            "status-update",
            `第 ${currentIndex} 个链接点击封面图成功`
          );
        } catch (elementShareError) {
          event.reply(
            "status-update",
            `第 ${currentIndex} 个链接点击封面图失败，尝试直接点击分享按钮`
          );
        }

        if (shouldStopSharing) {
          break;
        }

        await page.waitForSelector(".WB_btn_share", {
          visible: true,
          timeout: 30000,
        });

        await page.evaluate(() => {
          const shareBtn = document.querySelector(".WB_btn_share");
          if (shareBtn) shareBtn.click();
        });
        const success = await page.waitForSelector("#pl_share_success", {
          visible: true,
          timeout: 30000,
        }).catch(() => {
          event.reply("status-update", "分享失败，任务终止。请重新登录后再试");
          shouldStopSharing = true;
          isSharing = false;
          // 发送消息到渲染进程，重置按钮状态
          event.reply("login-required");
        });
        if (success) {
          event.reply("status-update", `第 ${currentIndex} 个链接分享成功`);

          if (currentIndex < links.length && !shouldStopSharing) {
            store.set("currentIndex", currentIndex);
            event.reply("status-update", `等待 ${interval / 1000} 秒后继续...`);
            // 添加停止检查
            for (let i = 0; i < interval / 100; i++) {
              if (shouldStopSharing) break;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            if (shouldStopSharing) break;
          }
        }
      } catch (error) {
        event.reply(
          "status-update",
          `第 ${currentIndex} 个链接分享失败: ${error.message}`
        );
        console.error(`分享失败详情:`, error);
        continue;
      }
    }

    isSharing = false;
    if (shouldStopSharing) {
      event.reply("status-update", "任务已停止, 点击" + "开始分享" + "按钮重新开始");
    } else {
      event.reply("status-success");
      store.set("currentIndex", 0);
    }
  } catch (error) {
    console.error("分享过程出错:", error);
    event.reply("status-update", "分享过程出错: " + error.message);
    isSharing = false;
  }
});

// 处理停止分享请求
ipcMain.on("stop-sharing", async () => {
  shouldStopSharing = true;
  isSharing = false;
});

ipcMain.on("reset-selected-links", async () => {
  store.set("currentIndex", 0);
});
