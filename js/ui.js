const UI = {
  historyBtn: document.getElementById("historyBtn"),
  settingsBtn: document.getElementById("settingsBtn"),

  historyModal: document.getElementById("historyModalBackdrop"),
  settingsModal: document.getElementById("settingsModalBackdrop"),

  closeHistory: document.getElementById("closeHistory"),
  closeSettings: document.getElementById("closeSettings"),

  helpButton: document.getElementById("helpButton"),
  helpText: document.getElementById("helpText"),

  startBtn: document.getElementById("startBtn"),
  lockBtn: document.getElementById("lockBtn"),
  saveBtn: document.getElementById("saveBtn"),
  resetBtn: document.getElementById("resetBtn"),

  saveModal: document.getElementById("saveModalBackdrop"),
  saveNameInput: document.getElementById("saveNameInput"),
  motorTypeSelect: document.getElementById("motorTypeSelect"),
  saveConfirmBtn: document.getElementById("saveConfirmBtn"),
  saveCancelBtn: document.getElementById("saveCancelBtn"),

  statusLine: document.getElementById("statusLine"),
};

/* 履歴モーダル */
UI.historyBtn.addEventListener("click", () => {
  UI.historyModal.classList.remove("hidden");
});

UI.closeHistory.addEventListener("click", () => {
  UI.historyModal.classList.add("hidden");
});

/* 設定モーダル */
UI.settingsBtn.addEventListener("click", () => {
  UI.settingsModal.classList.remove("hidden");
});

UI.closeSettings.addEventListener("click", () => {
  UI.settingsModal.classList.add("hidden");
});

/* ヘルプ */
UI.helpButton.addEventListener("click", () => {
  UI.helpText.classList.toggle("hidden");
});

/* 計測開始 / 停止 */
UI.startBtn.addEventListener("click", () => {
  measuring = !measuring;

  if (measuring) {
    UI.startBtn.textContent = "計測停止";
    UI.statusLine.textContent = "MEASURING — 計測中";
  } else {
    UI.startBtn.textContent = "計測開始";
    UI.statusLine.textContent = "MEASURING — 計測待機中";
  }
});

/* ロック */
UI.lockBtn.addEventListener("click", () => {
  UI.statusLine.textContent = "LOCKED — ロック中";
});

/* 保存モーダルを開く */
UI.saveBtn.addEventListener("click", () => {
  UI.saveModal.classList.remove("hidden");
});

/* 保存モーダル：キャンセル */
UI.saveCancelBtn.addEventListener("click", () => {
  UI.saveModal.classList.add("hidden");
});

/* 保存モーダル：保存する */
UI.saveConfirmBtn.addEventListener("click", () => {
  const name = UI.saveNameInput.value.trim();
  const motor = UI.motorTypeSelect.value;

  if (name.length === 0) {
    alert("名前を入力してください");
    return;
  }

  saveCurrentHistory(name, motor);
  UI.saveModal.classList.add("hidden");
  UI.saveNameInput.value = "";
  UI.motorTypeSelect.value = "";
});

/* リセット */
UI.resetBtn.addEventListener("click", () => {
  resetMeasurement();
  UI.statusLine.textContent = "MEASURING — 計測待機中";
});