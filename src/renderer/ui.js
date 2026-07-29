import { UI_STATE } from "./state.js";

export function updateStatus(statusDiv, message) {
  const timestamp = new Date().toLocaleTimeString();
  statusDiv.innerHTML += `<div>[${timestamp}] ${message}</div>`;
  statusDiv.scrollTop = statusDiv.scrollHeight;
}

export function renderLinks(textarea, links) {
  textarea.value = links.map((link, index) => `${index + 1}. ${link}`).join("\n\n");
}

export function applyUiState(elements, appState, hasLinks) {
  const {
    startButton,
    confirmLoginButton,
    stopButton,
    fileInput,
    syncButton,
    selectButton,
    chromePathInput,
  } = elements;

  const canStart =
    hasLinks &&
    [UI_STATE.IDLE, UI_STATE.STOPPED, UI_STATE.COMPLETED, UI_STATE.ERROR, UI_STATE.LOGIN_REQUIRED].includes(appState);
  const canConfirm = hasLinks && appState === UI_STATE.WAITING_FOR_LOGIN;
  const canStop = [UI_STATE.WAITING_FOR_LOGIN, UI_STATE.SHARING].includes(appState);
  const canEditInputs = appState !== UI_STATE.SHARING;

  startButton.disabled = !canStart;
  confirmLoginButton.disabled = !canConfirm;
  stopButton.disabled = !canStop;
  fileInput.disabled = !canEditInputs;
  syncButton.disabled = !canEditInputs;
  selectButton.disabled = !hasLinks || !canEditInputs;
  chromePathInput.disabled = !canEditInputs;
}
