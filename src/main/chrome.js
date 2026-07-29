const fs = require("fs");

const CHROME_PATHS = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
  ],
};

function detectChromePath(platform = process.platform) {
  const candidates = CHROME_PATHS[platform] || [];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function resolveChromePath(configuredPath) {
  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }

  const detectedPath = detectChromePath();
  if (detectedPath) {
    return detectedPath;
  }

  throw new Error("未找到可用的 Chrome，请在界面中配置 Chrome 可执行文件路径");
}

module.exports = {
  detectChromePath,
  resolveChromePath,
};
