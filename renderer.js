const { ipcRenderer } = require("electron");
const fs = require("fs");

const startButton = document.getElementById("startButton");
const confirmLogin = document.getElementById("confirmLogin");
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

let links = [];
let selectedLinks = [];

function updateStatus(message) {
  const timestamp = new Date().toLocaleTimeString();
  statusDiv.innerHTML += `<div>[${timestamp}] ${message}</div>`;
  statusDiv.scrollTop = statusDiv.scrollHeight;
}

// 同步链接函数
async function syncLinks() {
  try {
    updateStatus("开始同步链接...");

    // 发送同步请求
    const response = await fetch(
      "https://open.iyiou.com//open/weibo/getPostList",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    links = await response.json();
    if (links.length > 0) {
      links.forEach(
        (link, index) => (linksInput.value += `${index + 1} ${link}\n\n`)
      );
      updateStatus(`同步成功！共${links.length}个链接`);
      ipcRenderer.send("reset-selected-links");
      startButton.disabled = false;
      confirmLogin.disabled = false;
      minIndex.value = 1;
      maxIndex.value = links.length
      selectedLinks = links;
    }
  } catch (error) {
    updateStatus(`同步失败: ${error.message}`);
    console.error("同步错误:", error);
  }
}

// 添加同步按钮事件监听
syncButton.addEventListener("click", async () => {
  linksInput.value = '';
  links = [];
  syncButton.disabled = true;
  try {
    await syncLinks();
  } finally {
    syncButton.disabled = false;
  }
});

// 处理文件上传
fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  if (file.type !== "text/plain" && !file.name.endsWith(".txt")) {
    updateStatus("请上传txt格式的文件");
    fileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    links = content
      .split("\n")
      .map((link) => link.trim())
      .filter((link) => link !== "");

    if (links.length === 0) {
      updateStatus("文件中没有找到有效的链接");
      startButton.disabled = true;
      return;
    }

    // 在文本框中显示链接预览
    linksInput.value = links.join("\n\n");
    uploadInfo.textContent = `已加载 ${links.length} 个链接`;
    startButton.disabled = false;
    confirmLogin.disabled = false;
    updateStatus(`链接文件加载成功，共${links.length}个链接`);
  };

  reader.onerror = () => {
    updateStatus("读取文件失败");
    fileInput.value = "";
  };

  reader.readAsText(file);
});
// 启动浏览器
startButton.addEventListener("click", () => {
  const interval = parseInt(intervalInput.value) * 1000;

  if (interval < 10000) {
    updateStatus("间隔时间不能小于10秒");
    return;
  }

  // 存储当前配置
  ipcRenderer.send("start-sharing", { links, interval });

  startButton.disabled = true;
  fileInput.disabled = true;
  updateStatus("浏览器启动中，请在打开的浏览器中完成微博登录...");
});
// 确认登录
confirmLogin.addEventListener("click", () => {
  const result = confirm(
    '请确认：\n1. 是否已经点击"启动浏览器"按钮？\n2. 浏览器是否已经打开？\n3. 是否已经在浏览器中完成微博登录？'
  );

  if (result) {
    const interval = parseInt(intervalInput.value) * 1000;
    ipcRenderer.send("login-confirmed", { links: selectedLinks, interval });
    confirmLogin.disabled = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    updateStatus("开始执行分享任务...");
  } else {
    updateStatus('请先点击"启动浏览器"按钮，并在打开的浏览器中完成登录');
    // 如果浏览器未启动，启用启动按钮
    if (startButton.disabled && !stopButton.disabled) {
      startButton.disabled = false;
    }
  }
});
// 停止分享
stopButton.addEventListener("click", () => {
  ipcRenderer.send("stop-sharing");
  updateStatus("已停止分享任务");
  startButton.disabled = false;
  if (links.length > 0) {
    confirmLogin.disabled = false;
  }
  stopButton.disabled = true;
  fileInput.disabled = false;
});
minIndex.addEventListener("change", () => {
  const min = parseInt(minIndex.value);
  const max = parseInt(maxIndex.value);
  if (min < 1 || max < 1 || min > max || max > links.length) {
    alert("请输入正确的范围");
    minIndex.value = 1;
    return;
  }
});
maxIndex.addEventListener("change", () => {
  const min = parseInt(minIndex.value);
  const max = parseInt(maxIndex.value);
  
  if (min < 1 || max < 1 || min > max || max > links.length) {
    alert("请输入正确的范围");
    maxIndex.value = links.length;
    return;
  }
  links = links.slice(min - 1, max);
  linksInput.value = '';
  links.forEach(
    (link, index) => (linksInput.value += `${index + 1} ${link}\n\n`)
  );
  updateStatus(`已选择${links.length}个链接`);
  ipcRenderer.send("reset-selected-links");
});
// 筛选
selectButton.addEventListener("click", () => {
  const min = parseInt(minIndex.value);
  const max = parseInt(maxIndex.value);
  selectedLinks = links.slice(min - 1, max);
  linksInput.value = '';
  selectedLinks.forEach(
    (link, index) => (linksInput.value += `${index + 1} ${link}\n\n`)
  );
  updateStatus(`已选择${selectedLinks.length}个链接`);
  ipcRenderer.send("reset-selected-links");
});
// 监听主进程消息
ipcRenderer.on("status-update", (event, message) => {
  updateStatus(message);
});

ipcRenderer.on("wait-for-login", () => {
  confirmLogin.disabled = false;
});

// 添加登录检查的监听器
ipcRenderer.on("login-required", () => {
  startButton.disabled = false;
  confirmLogin.disabled = true;
  stopButton.disabled = true;
  fileInput.disabled = false;
  updateStatus('检测到未登录状态，请点击"启动浏览器"按钮重新登录');
});

ipcRenderer.on("status-success", () => {
  updateStatus("所有链接处理完成！");
  stopButton.disabled = true;
  fileInput.disabled = false;
  startButton.disabled = false;
  confirmLogin.disabled = false;
});
