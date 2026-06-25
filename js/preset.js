/* ============================
   プリセット（長押し保存 / 短押し読込） 8スロット
============================ */
(function initPresetButtons() {
  const grid = document.getElementById("presetGrid");
  grid.innerHTML = ""; // 初期化

  for (let i = 1; i <= 8; i++) {
    const btn = document.createElement("button");
    btn.className = "preset-btn";
    btn.textContent = `P${i}`;
    btn.style.userSelect = "none";

    let pressStart = 0;
    let pressTimer = null;

    const startPress = (ev) => {
      ev.preventDefault();
      try { window.getSelection().removeAllRanges(); } catch(e) {}
      pressStart = Date.now();

      pressTimer = setTimeout(() => {
        managePreset(i, true);  // 長押し → 保存
      }, 600);
    };

    const endPress = (ev) => {
      ev.preventDefault();
      clearTimeout(pressTimer);

      if (Date.now() - pressStart < 600) {
        managePreset(i, false); // 短押し → 読込
      }
    };

    btn.addEventListener("mousedown", startPress);
    btn.addEventListener("mouseup", endPress);
    btn.addEventListener("mouseleave", endPress);

    btn.addEventListener("touchstart", startPress, { passive: false });
    btn.addEventListener("touchend", endPress, { passive: false });
    btn.addEventListener("touchcancel", endPress, { passive: false });

    grid.appendChild(btn);
  }

  updatePresetButtonStyles();
})();

/* ============================
   プリセット表示更新（＋表示）
============================ */
function updatePresetButtonStyles() {
  for (let i = 1; i <= 8; i++) {
    const key = `rpm_preset_${i}`;
    const btn = document.querySelector(`#presetGrid .preset-btn:nth-child(${i})`);
    if (!btn) continue;

    const saved = localStorage.getItem(key);

    if (!saved) {
      btn.classList.add("empty");
      btn.innerHTML = "";
    } else {
      btn.classList.remove("empty");
      const config = JSON.parse(saved);
      const label = config.label || `P${i}`;
      btn.innerHTML = `<span class="preset-label">${label}</span>`;
    }
  }
}

/* ============================
   プリセット保存 / 読込
============================ */
function managePreset(slot, saveMode) {
  const key = `rpm_preset_${slot}`;

  if (saveMode) {
    const label = prompt(`P${slot} の名前を入力してください（例：Mach、HD、TT-PRO）`, "");

    const config = {
      volt: slideVolt.value,
      gearIdx: slideGear.value,
      tire: slideTire.value,
      poles: inputPoles.value,
      noise: inputNoise.value,
      calib: inputCalib.value,
      phase: inputPhase.value,
      label: label || ""
    };

    localStorage.setItem(key, JSON.stringify(config));
    updatePresetButtonStyles();
    return;
  }

  const saved = localStorage.getItem(key);
  if (!saved) return;

  const config = JSON.parse(saved);
  slideVolt.value = config.volt;
  slideGear.value = config.gearIdx;
  slideTire.value = config.tire;
  inputPoles.value = config.poles || 1;
  inputNoise.value = config.noise || -120;
  inputCalib.value = config.calib || 1.00;
  inputPhase.value = config.phase || "before";

  updateSliderLabels();
  updatePresetButtonStyles();
}

/* ============================
   スライダー表示更新（UI.js と連携）
============================ */
function updateSliderLabels() {
  const currentVolt = parseFloat(slideVolt.value);
  const currentGear = GEAR_VALUES[slideGear.value];
  const currentTire = parseFloat(slideTire.value);

  document.getElementById("valVolt").textContent = currentVolt.toFixed(1) + "V";
  document.getElementById("valGear").textContent = currentGear.toFixed(1) + ":1";
  document.getElementById("valTire").textContent = currentTire.toFixed(1) + "mm";

  document.getElementById("dispVolt").textContent = currentVolt.toFixed(1) + " V";
  document.getElementById("dispGear").textContent = currentGear.toFixed(1) + " :1";
  document.getElementById("dispTire").textContent = currentTire.toFixed(1) + " mm";
  document.getElementById("dispPoles").textContent = parseInt(inputPoles.value) + " P";

  const phaseText = inputPhase.value === "after" ? "慣らし後" : "慣らし前";
  document.getElementById("valPhase").textContent = phaseText;

  if (!locked) {
    const max = currentSessionRPMs.length > 0 ? Math.max(...currentSessionRPMs) : 0;
    generateMatrixTable(max, currentVolt);
  }
}
