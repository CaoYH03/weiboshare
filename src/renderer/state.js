export const UI_STATE = {
  IDLE: "idle",
  WAITING_FOR_LOGIN: "waiting_for_login",
  SHARING: "sharing",
  STOPPED: "stopped",
  LOGIN_REQUIRED: "login_required",
  COMPLETED: "completed",
  ERROR: "error",
};

export function createInitialState() {
  return {
    uiState: UI_STATE.IDLE,
    originalLinks: [],
    selectedLinks: [],
    intervalSeconds: 30,
    chromePath: "",
  };
}

export function parseLinks(content) {
  const seen = new Set();

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((link) => {
      if (seen.has(link)) {
        return false;
      }

      seen.add(link);
      return true;
    });
}

export function getSelectedRange(links, minValue, maxValue) {
  const min = Number.parseInt(minValue, 10);
  const max = Number.parseInt(maxValue, 10);

  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > links.length) {
    throw new Error("请输入正确的范围");
  }

  return links.slice(min - 1, max);
}
