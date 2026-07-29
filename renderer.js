import { createInitialState, getSelectedRange, parseLinks, UI_STATE } from "./src/renderer/state.js";
import { applyUiState, renderLinks, updateStatus } from "./src/renderer/ui.js";

const startButton = document.getElementById("startButton");
const confirmLoginButton = document.getElementById("confirmLogin");
const stopButton = document.getElementById("stopButton");
const syncButton = document.getElementById("syncButton");
const statusDiv = document.getElementById("status");
const linksInput = document.getElementById("linksInput");
const intervalInput = document.getElementById("intervalInput");
const fileInput = document.getElementById("fileInput");
const uploadInfo = document.getElementById("uploadInfo");
const minIndex = document.getElementById("minIndex");
const maxIndex = document.getElementById("maxIndex");
const selectButton = document.getElementById("selectButton");
const chromePathInput = document.getElementById("chromePathInput");
const selectedSummary = document.getElementById("selectedSummary");

const state = createInitialState();

const elements = {
  startButton,
  confirmLoginButton,
  stopButton,
  fileInput,
  syncButton,
  selectButton,
  chromePathInput,
};

function syncUiState() {
  applyUiState(elements, state.uiState, state.selectedLinks.length > 0);
  selectedSummary.textContent =
    state.originalLinks.length > 0
      ? `当前已选择 ${state.selectedLinks.length} / ${state.originalLinks.length} 个链接`
      : "当前还没有可分享的链接";
}

function updateRangeInputs() {
  if (state.originalLinks.length === 0) {
    minIndex.value = "";
    maxIndex.value = "";
    return;
  }

  minIndex.value = "1";
  maxIndex.value = String(state.originalLinks.length);
}

async function resetProgress() {
  await window.weiboShareApi.resetProgress();
}

function setLinks(nextLinks, sourceLabel) {
  state.originalLinks = [...nextLinks];
  state.selectedLinks = [...nextLinks];
  renderLinks(linksInput, state.selectedLinks);
  uploadInfo.textContent = `已加载 ${nextLinks.length} 个链接`;
  updateRangeInputs();
  void resetProgress();
  syncUiState();
  updateStatus(statusDiv, `${sourceLabel}成功，共 ${nextLinks.length} 个链接`);
}

async function saveSettings() {
  const intervalSeconds = Number.parseInt(intervalInput.value, 10);
  state.intervalSeconds = intervalSeconds;
  state.chromePath = chromePathInput.value.trim();

  await window.weiboShareApi.saveSettings({
    intervalSeconds,
    chromePath: state.chromePath,
  });
}

async function syncLinks() {
  updateStatus(statusDiv, "开始同步链接...");

  const response = await fetch("https://open.iyiou.com//open/weibo/getPostList", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("接口返回的数据格式不正确");
  }

  const nextLinks = data.filter((link) => typeof link === "string" && link.trim());
  if (nextLinks.length === 0) {
    throw new Error("接口未返回有效链接");
  }

  setLinks(nextLinks, "同步链接");
}

async function initialize() {
  const settings = await window.weiboShareApi.getSettings();
  intervalInput.value = String(settings.intervalSeconds || state.intervalSeconds);
  chromePathInput.value = settings.chromePath || "";
  syncUiState();
}

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  if (file.type !== "text/plain" && !file.name.endsWith(".txt")) {
    updateStatus(statusDiv, "请上传 txt 格式的文件");
    fileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    const content = String(loadEvent.target?.result || "");
    const nextLinks = parseLinks(content);

    if (nextLinks.length === 0) {
      updateStatus(statusDiv, "文件中没有找到有效的链接");
      return;
    }

    setLinks(nextLinks, "链接文件加载");
  };

  reader.onerror = () => {
    updateStatus(statusDiv, "读取文件失败");
    fileInput.value = "";
  };

  reader.readAsText(file);
});

syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  linksInput.value = "";

  try {
    await syncLinks();
  } catch (error) {
    updateStatus(statusDiv, `同步失败: ${error.message}`);
    console.error("同步错误:", error);
  } finally {
    syncButton.disabled = false;
    syncUiState();
  }
});

selectButton.addEventListener("click", async () => {
  try {
    state.selectedLinks = getSelectedRange(state.originalLinks, minIndex.value, maxIndex.value);
    renderLinks(linksInput, state.selectedLinks);
    await resetProgress();
    updateStatus(statusDiv, `已选择 ${state.selectedLinks.length} 个链接`);
    syncUiState();
  } catch (error) {
    window.alert(error.message);
  }
});

startButton.addEventListener("click", async () => {
  const intervalSeconds = Number.parseInt(intervalInput.value, 10);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 10) {
    updateStatus(statusDiv, "间隔时间不能小于 10 秒");
    return;
  }

  await saveSettings();
  updateStatus(statusDiv, "浏览器启动中，请在打开的浏览器中完成微博登录...");

  const result = await window.weiboShareApi.startSharing();
  if (!result.ok) {
    state.uiState = UI_STATE.ERROR;
    updateStatus(statusDiv, `启动失败: ${result.message}`);
    syncUiState();
  }
});

confirmLoginButton.addEventListener("click", async () => {
  const confirmed = window.confirm(
    '请确认：\n1. 已点击“启动浏览器”按钮\n2. 浏览器已打开\n3. 已在浏览器中完成微博登录'
  );

  if (!confirmed) {
    updateStatus(statusDiv, '请先点击“启动浏览器”按钮，并在打开的浏览器中完成登录');
    return;
  }

  await saveSettings();
  updateStatus(statusDiv, "开始执行分享任务...");

  const result = await window.weiboShareApi.confirmLogin({
    links: state.selectedLinks,
    interval: Number.parseInt(intervalInput.value, 10) * 1000,
  });

  if (!result.ok) {
    state.uiState = UI_STATE.ERROR;
    updateStatus(statusDiv, `分享过程出错: ${result.message}`);
    syncUiState();
  }
});

stopButton.addEventListener("click", async () => {
  await window.weiboShareApi.stopSharing();
  updateStatus(statusDiv, "已停止分享任务");
});

intervalInput.addEventListener("change", () => {
  void saveSettings();
});

chromePathInput.addEventListener("change", () => {
  void saveSettings();
});

window.weiboShareApi.onStatusUpdate((message) => {
  updateStatus(statusDiv, message);
});

window.weiboShareApi.onStateChange((nextState) => {
  state.uiState = nextState;
  syncUiState();
});

window.weiboShareApi.onWaitForLogin(() => {
  state.uiState = UI_STATE.WAITING_FOR_LOGIN;
  syncUiState();
});

window.weiboShareApi.onLoginRequired(() => {
  state.uiState = UI_STATE.LOGIN_REQUIRED;
  updateStatus(statusDiv, '检测到未登录状态，请点击“启动浏览器”按钮重新登录');
  syncUiState();
});

window.weiboShareApi.onStatusSuccess(() => {
  state.uiState = UI_STATE.COMPLETED;
  updateStatus(statusDiv, "所有链接处理完成！");
  syncUiState();
});

void initialize();
