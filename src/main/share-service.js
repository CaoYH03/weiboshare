const puppeteer = require("puppeteer-core");

const { resolveChromePath } = require("./chrome");

const APP_STATE = {
  IDLE: "idle",
  WAITING_FOR_LOGIN: "waiting_for_login",
  SHARING: "sharing",
  STOPPED: "stopped",
  LOGIN_REQUIRED: "login_required",
  COMPLETED: "completed",
  ERROR: "error",
};

class ShareService {
  constructor({ store, sendToRenderer }) {
    this.store = store;
    this.sendToRenderer = sendToRenderer;
    this.browser = null;
    this.page = null;
    this.state = APP_STATE.IDLE;
    this.shouldStop = false;
  }

  setState(nextState) {
    this.state = nextState;
    this.sendToRenderer("app-state", nextState);
  }

  setStatus(message) {
    this.sendToRenderer("status-update", message);
  }

  async assertLoginStillValid() {
    if (!this.page) {
      return;
    }

    const context = await this.page.evaluate(() => ({
      url: window.location.href,
      title: document.title || "",
      bodyText: document.body ? document.body.innerText || "" : "",
    }));

    const mergedText = `${context.url}\n${context.title}\n${context.bodyText}`;
    if (
      mergedText.includes("登录状态发生改变") ||
      mergedText.includes("重新登录") ||
      mergedText.includes("请重新登录") ||
      /passport\.weibo\.com/.test(context.url)
    ) {
      const error = new Error("微博登录状态已失效，请重新登录后再试");
      error.code = "LOGIN_REQUIRED";
      throw error;
    }
  }

  async start() {
    if ([APP_STATE.WAITING_FOR_LOGIN, APP_STATE.SHARING].includes(this.state)) {
      throw new Error("已有分享任务正在进行中");
    }

    await this.cleanupBrowser();
    this.shouldStop = false;
    this.setState(APP_STATE.WAITING_FOR_LOGIN);
    this.setStatus("正在启动浏览器...");

    try {
      const chromePath = resolveChromePath(this.store.get("chromePath"));
      this.setStatus("正在连接 Chrome 浏览器...");

      this.browser = await puppeteer.launch({
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

      this.page = await this.browser.newPage();
      const viewport = await this.page.evaluate(() => ({
        width: window.screen.width,
        height: window.screen.height,
      }));

      await this.page.setViewport(viewport);
      this.page.setDefaultNavigationTimeout(60000);
      this.page.setDefaultTimeout(60000);
      await this.page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      this.page.on("console", (msg) => {
        console.log("浏览器页面日志:", msg.text());
      });

      this.browser.on("disconnected", () => {
        this.browser = null;
        this.page = null;
        if ([APP_STATE.WAITING_FOR_LOGIN, APP_STATE.SHARING].includes(this.state)) {
          this.setState(APP_STATE.ERROR);
          this.setStatus("浏览器连接已断开，请重新启动任务");
        }
      });

      this.setStatus("正在打开微博登录页...");
      await this.page.goto("https://passport.weibo.com/sso/signin", {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      this.setStatus('请在浏览器中完成登录，然后点击"开始分享"按钮');
      this.sendToRenderer("wait-for-login");
    } catch (error) {
      await this.cleanupBrowser();
      this.setState(APP_STATE.ERROR);
      throw error;
    }
  }

  async confirmLogin({ links = [], interval }) {
    if (!this.page || this.state !== APP_STATE.WAITING_FOR_LOGIN) {
      throw new Error("浏览器尚未就绪，请先启动浏览器并完成登录");
    }

    if (!Array.isArray(links) || links.length === 0) {
      throw new Error("没有可分享的链接");
    }

    this.shouldStop = false;
    this.setState(APP_STATE.SHARING);

    const resumeIndex = this.store.get("currentIndex") || 0;

    try {
      for (let index = resumeIndex; index < links.length; index += 1) {
        if (this.shouldStop) {
          await this.cleanupBrowser();
          this.setState(APP_STATE.STOPPED);
          this.setStatus("分享任务已停止");
          return;
        }

        this.store.set("currentIndex", index);
        this.setStatus(`正在处理第 ${index + 1}/${links.length} 个链接`);

        try {
          await this.shareSingleLink(links[index], index + 1);
          this.setStatus(`第 ${index + 1} 个链接分享成功`);
        } catch (error) {
          if (error.code === "LOGIN_REQUIRED") {
            await this.cleanupBrowser();
            this.setState(APP_STATE.LOGIN_REQUIRED);
            this.setStatus("分享失败，登录状态可能已失效，请重新登录后再试");
            this.sendToRenderer("login-required");
            return;
          }

          this.setStatus(`第 ${index + 1} 个链接分享失败: ${error.message}`);
          console.error("分享失败详情:", error);
          continue;
        }

        if (index < links.length - 1) {
          this.store.set("currentIndex", index + 1);
          this.setStatus(`等待 ${interval / 1000} 秒后继续...`);
          const shouldContinue = await this.waitWithStopCheck(interval);
          if (!shouldContinue) {
            await this.cleanupBrowser();
            this.setState(APP_STATE.STOPPED);
            this.setStatus("分享任务已停止");
            return;
          }
        }
      }

      this.store.set("currentIndex", 0);
      await this.cleanupBrowser();
      this.setState(APP_STATE.COMPLETED);
      this.sendToRenderer("status-success");
    } catch (error) {
      this.setState(APP_STATE.ERROR);
      throw error;
    }
  }

  async stop() {
    this.shouldStop = true;
    if (this.state === APP_STATE.WAITING_FOR_LOGIN) {
      await this.cleanupBrowser();
      this.setState(APP_STATE.STOPPED);
      return;
    }

    if (this.state === APP_STATE.SHARING) {
      this.setState(APP_STATE.STOPPED);
    }
  }

  resetProgress() {
    this.store.set("currentIndex", 0);
  }

  async shareSingleLink(link, currentIndex) {
    await this.page.goto(link, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    await this.assertLoginStillValid();
    await this.tryClickCover(currentIndex);
    await this.assertLoginStillValid();
    await this.clickShareButton();

    const success = await this.page
      .waitForSelector("#pl_share_success", {
        visible: true,
        timeout: 30000,
      })
      .catch(() => null);

    if (!success) {
      const error = new Error("未检测到分享成功提示");
      error.code = "LOGIN_REQUIRED";
      throw error;
    }
  }

  async tryClickCover(currentIndex) {
    try {
      await this.page.waitForSelector(".element_share", {
        visible: true,
        timeout: 30000,
      });

      await this.page.evaluate(() => {
        const coverButton = document.querySelector(".element_share");
        if (coverButton) {
          coverButton.click();
        }
      });

      await this.delay(2000);
      this.setStatus(`第 ${currentIndex} 个链接点击封面图成功`);
    } catch (_error) {
      this.setStatus(`第 ${currentIndex} 个链接点击封面图失败，尝试直接点击分享按钮`);
    }
  }

  async clickShareButton() {
    const selectors = [
      "#shareIt",
      "a#shareIt[title='分享']",
      ".WB_btn_share",
      ".WB_btn_share_dis",
      "[node-type='share_btn']",
      "[action-type='share']",
      "a[href*='share.php']",
    ];

    for (const selector of selectors) {
      const button = await this.page.$(selector);
      if (!button) {
        continue;
      }

      await this.page.evaluate((targetSelector) => {
        const shareButton = document.querySelector(targetSelector);
        if (shareButton) {
          shareButton.click();
        }
      }, selector);
      return;
    }

    const clickedByText = await this.page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("button,a,div,span"));
      const shareButton = candidates.find((element) => {
        const text = (element.textContent || "").replace(/\s+/g, "").trim();
        if (!text) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (text === "分享" || text.includes("分享"));
      });

      if (!shareButton) {
        return false;
      }

      shareButton.click();
      return true;
    });

    if (!clickedByText) {
      throw new Error("未找到微博分享按钮");
    }
  }

  async waitWithStopCheck(interval) {
    const steps = Math.ceil(interval / 100);
    for (let index = 0; index < steps; index += 1) {
      if (this.shouldStop) {
        return false;
      }

      await this.delay(100);
    }

    return true;
  }

  async cleanupBrowser() {
    if (!this.browser) {
      return;
    }

    try {
      await this.browser.close();
    } catch (error) {
      console.error("关闭浏览器失败:", error);
    } finally {
      this.browser = null;
      this.page = null;
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = {
  APP_STATE,
  ShareService,
};
