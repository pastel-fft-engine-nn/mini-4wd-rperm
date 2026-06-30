const waveCanvas = document.getElementById("waveCanvas");
const ctx = waveCanvas.getContext("2d");

const rpmNow = document.getElementById("rpmNow");
const rpmMax = document.getElementById("rpmMax");
const rpmMin = document.getElementById("rpmMin");

const speedNow = document.getElementById("speedNow");
const speedTop = document.getElementById("speedTop");
const speedMin = document.getElementById("speedMin");

const historyList = document.getElementById("historyList");

let measuring = false; // ui.js でトグルされる

let currentRpm = 0;
let maxRpmVal = 0;
let minRpmVal = 0;
let currentSpeed = 0;
let maxSpeedVal = 0;
let minSpeedVal = 0;

let audioCtx = null;
let analyser = null;
let dataArray = null;
let stream = null;
let running = false;

let lastRpm = null;
let lastPeakBin = null;

const FFT_SIZE = 8192;

/* キャンバスサイズ調整 */
function resizeCanvas() {
  waveCanvas.width = waveCanvas.clientWidth;
  waveCanvas.height = waveCanvas.clientHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

/* RPM → SPEED 計算（補正係数＋負荷込み） */
function computeSpeedFromRpm(rpm) {
  const tire = parseFloat(document.getElementById("tireRange").value);
  const gearIndex = parseInt(document.getElementById("gearRange").value, 10);
  const gearRatio = parseFloat(gearOptions[gearIndex].split(":")[0]);

  const rpmCal = parseFloat(document.getElementById("rpmCalRange").value);
  const loadFactor = parseFloat(document.getElementById("loadFactorRange").value) / 100;

  const adjustedRpm = rpm * rpmCal;
  const wheelRpm = adjustedRpm / gearRatio;
  const wheelRps = wheelRpm / 60;
  const circumference = Math.PI * (tire / 1000);

  let speed = wheelRps * circumference * 3.6;
  speed *= 1 + loadFactor;

  return { adjustedRpm, speed };
}

/* スムージング係数（RPM依存） */
function getSmoothAlpha(rpm) {
  if (rpm < 20000) return 0.30;
  if (rpm < 30000) return 0.25;
  if (rpm < 40000) return 0.20;
  return 0.18;
}

/* 自動レンジ（内部用：周波数レンジをRPMに合わせて絞る） */
function getSearchRangeBins(sampleRate, fftSize) {
  const baseMinRpm = 5000;
  const baseMaxRpm = 55000;

  let minRpm = baseMinRpm;
  let maxRpm = baseMaxRpm;

  if (lastRpm && lastRpm > 5000 && lastRpm < 55000) {
    const span = 5000;
    minRpm = Math.max(baseMinRpm, lastRpm - span);
    maxRpm = Math.min(baseMaxRpm, lastRpm + span);
  }

  const minFreq = minRpm / 60;
  const maxFreq = maxRpm / 60;
  const binToHz = sampleRate / fftSize;

  const minBin = Math.floor(minFreq / binToHz);
  const maxBin = Math.floor(maxFreq / binToHz);

  return { minBin, maxBin, binToHz };
}

/* ピーク検出（パラボラ補間＋前回ピーク追従＋ノイズ閾値） */
function getPrecisePeakHz(data, fftSize, sampleRate) {
  const noiseDb = parseFloat(document.getElementById("noiseRange").value);
  const noiseThreshold = (noiseDb / 100) * 255;

  const len = data.length;
  const { minBin, maxBin, binToHz } = getSearchRangeBins(sampleRate, fftSize);

  const from = Math.max(1, Math.min(minBin, len - 2));
  const to = Math.max(2, Math.min(maxBin, len - 1));

  let maxVal = -Infinity;
  let maxIdx = -1;

  if (lastPeakBin !== null) {
    const searchRadius = 6;
    const center = Math.floor(lastPeakBin);
    const sFrom = Math.max(from, center - searchRadius);
    const sTo = Math.min(to, center + searchRadius);
    for (let i = sFrom; i <= sTo; i++) {
      const v = data[i];
      if (v > noiseThreshold && v > maxVal) {
        maxVal = v;
        maxIdx = i;
      }
    }
  }

  if (maxIdx === -1) {
    for (let i = from; i <= to; i++) {
      const v = data[i];
      if (v > noiseThreshold && v > maxVal) {
        maxVal = v;
        maxIdx = i;
      }
    }
  }

  if (maxIdx <= from || maxIdx >= to || maxVal <= noiseThreshold) return 0;

  const y1 = data[maxIdx - 1];
  const y2 = data[maxIdx];
  const y3 = data[maxIdx + 1];

  const denom = (y1 - 2 * y2 + y3);
  const offset = denom === 0 ? 0 : (y1 - y3) / (2 * denom);
  const peakBin = maxIdx + offset;

  lastPeakBin = peakBin;

  return peakBin * binToHz;
}

/* FFT描画（実データ） */
function drawFFT(data) {
  const w = waveCanvas.width;
  const h = waveCanvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.strokeStyle = "#ff4fa3";
  ctx.lineWidth = 1.5;

  if (!data) {
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.stroke();
    return;
  }

  const step = data.length / w;
  const scale = h / 256;

  for (let x = 0; x < w; x++) {
    const bin = Math.floor(x * step);
    const v = data[bin];
    const y = h - v * scale;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/* Audio開始 */
async function startAudio() {
  if (running) return;
  running = true;

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } else if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = FFT_SIZE;

  const binCount = analyser.frequencyBinCount;
  dataArray = new Uint8Array(binCount);

  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyser);

  lastRpm = null;
  lastPeakBin = null;

  loop();
}

/* Audio停止 */
function stopAudio() {
  if (!running) return;
  running = false;

  if (audioCtx && audioCtx.state === "running") {
    audioCtx.suspend();
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

/* メインループ */
function loop() {
  if (!running || !measuring) return;
  requestAnimationFrame(loop);

  analyser.getByteFrequencyData(dataArray);

  drawFFT(dataArray);

  const peakHz = getPrecisePeakHz(dataArray, analyser.fftSize, audioCtx.sampleRate);
  if (peakHz <= 0) return;

  const rawRpm = peakHz * 60;
  const { adjustedRpm, speed } = computeSpeedFromRpm(rawRpm);

  const alpha = getSmoothAlpha(adjustedRpm);
  let displayRpm = adjustedRpm;
  if (lastRpm !== null) {
    displayRpm = lastRpm * (1 - alpha) + adjustedRpm * alpha;
  }
  lastRpm = displayRpm;

  currentRpm = displayRpm;
  currentSpeed = speed;

  if (maxRpmVal === 0 || displayRpm > maxRpmVal) maxRpmVal = displayRpm;
  if (minRpmVal === 0 || displayRpm < minRpmVal) minRpmVal = displayRpm;

  if (maxSpeedVal === 0 || speed > maxSpeedVal) maxSpeedVal = speed;
  if (minSpeedVal === 0 || speed < minSpeedVal) minSpeedVal = speed;

  rpmNow.textContent = Math.round(displayRpm);
  rpmMax.textContent = Math.round(maxRpmVal);
  rpmMin.textContent = Math.round(minRpmVal);

  speedNow.textContent = speed.toFixed(2) + " km/h";
  speedTop.textContent = maxSpeedVal.toFixed(2) + " km/h";
  speedMin.textContent = minSpeedVal.toFixed(2) + " km/h";
}

/* measuring フラグ監視（ui.js と連携） */
function watchMeasuring() {
  if (measuring && !running) {
    startAudio().catch(() => {
      // マイク許可がない場合などは何もしない
    });
  } else if (!measuring && running) {
    stopAudio();
  }
  requestAnimationFrame(watchMeasuring);
}
watchMeasuring();

/* 比較表（そのまま） */
function generateComparisonTable() {
  const comparisonBody = document.getElementById("comparisonBody");
  comparisonBody.innerHTML = "";

  const tire = parseFloat(document.getElementById("tireRange").value);
  const currentVoltage = parseFloat(document.getElementById("voltageRange").value).toFixed(1);

  const baseRpmAt28 = 15000;

  for (let v = 2.2; v <= 3.4; v += 0.1) {
    const voltage = v.toFixed(1);
    const tr = document.createElement("tr");

    if (voltage === currentVoltage) tr.classList.add("highlight-row");

    const rpm = Math.round(baseRpmAt28 * (v / 2.8));

    const tdV = document.createElement("td");
    tdV.textContent = voltage + " V";
    tr.appendChild(tdV);

    const tdR = document.createElement("td");
    tdR.textContent = rpm;
    tr.appendChild(tdR);

    ["3.5:1", "3.7:1", "4.0:1"].forEach(g => {
      const gearRatio = parseFloat(g.split(":")[0]);
      const wheelRpm = rpm / gearRatio;
      const wheelRps = wheelRpm / 60;
      const circumference = Math.PI * (tire / 1000);
      const speed = wheelRps * circumference * 3.6;

      const td = document.createElement("td");
      td.textContent = speed.toFixed(2);

      const currentGear = gearOptions[parseInt(document.getElementById("gearRange").value)];
      if (g === currentGear) td.classList.add("highlight-col");

      tr.appendChild(td);
    });

    comparisonBody.appendChild(tr);
  }
}

/* リセット */
function resetMeasurement() {
  measuring = false;
  stopAudio();

  currentRpm = 0;
  maxRpmVal = 0;
  minRpmVal = 0;
  currentSpeed = 0;
  maxSpeedVal = 0;
  minSpeedVal = 0;
  lastRpm = null;
  lastPeakBin = null;

  rpmNow.textContent = "0";
  rpmMax.textContent = "0";
  rpmMin.textContent = "0";

  speedNow.textContent = "0.00 km/h";
  speedTop.textContent = "0.00 km/h";
  speedMin.textContent = "0.00 km/h";

  document.getElementById("startBtn").textContent = "計測開始";
}

/* 保存 */
function saveCurrentHistory(name, motorType) {

  if (isNaN(currentSpeed) || currentSpeed === 0) {
    alert("計測が完了していません");
    return;
  }

  const voltage = parseFloat(document.getElementById("voltageRange").value).toFixed(1);
  const gearIndex = parseInt(document.getElementById("gearRange").value, 10);
  const gearStr = gearOptions[gearIndex];
  const tire = parseFloat(document.getElementById("tireRange").value).toFixed(1);

  const entry = {
    date: new Date().toLocaleString(),
    name,
    motor: motorType,
    voltage,
    gear: gearStr,
    tire,
    rpm: Math.round(currentRpm),
    speed: currentSpeed.toFixed(2),
  };

  const list = JSON.parse(localStorage.getItem("rpmHistory") || "[]");
  list.unshift(entry);
  localStorage.setItem("rpmHistory", JSON.stringify(list));

  renderHistory();
  buildFilterOptions();
}


/* 履歴フィルター */
function buildFilterOptions() {
  const list = JSON.parse(localStorage.getItem("rpmHistory") || "[]");

  const voltages = new Set();
  const gears = new Set();
  const tires = new Set();
  const motors = new Set();
  const names = new Set();

  list.forEach(item => {
    voltages.add(item.voltage);
    gears.add(item.gear);
    tires.add(item.tire);
    motors.add(item.motor);
    names.add(item.name);
  });

  fillSelect(filterVoltage, voltages, "電圧指定なし");
  fillSelect(filterGear, gears, "ギヤ比指定なし");
  fillSelect(filterTire, tires, "タイヤ径指定なし");
  fillSelect(filterMotor, motors, "モーター指定なし");
  fillSelect(filterName, names, "名前指定なし");
}

function fillSelect(select, values, label) {
  const current = select.value;
  select.innerHTML = `<option value="">${label}</option>`;
  [...values].forEach(v => {
    if (!v) return;
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
  select.value = current;
}

function applyHistoryFilter(list) {
  return list.filter(item => {
    if (filterVoltage.value && item.voltage !== filterVoltage.value) return false;
    if (filterGear.value && item.gear !== filterGear.value) return false;
    if (filterTire.value && item.tire !== filterTire.value) return false;
    if (filterMotor.value && item.motor !== filterMotor.value) return false;
    if (filterName.value && item.name !== filterName.value) return false;
    return true;
  });
}

/* 履歴表示 */
function renderHistory() {
  const list = JSON.parse(localStorage.getItem("rpmHistory") || "[]");
  const filtered = applyHistoryFilter(list);

  historyList.innerHTML = "";

  filtered.forEach(item => {
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `
      <span>${item.date}</span>
      <span>${item.name}</span>
      <span>${item.motor}</span>
      <span>${item.voltage}</span>
      <span>${item.gear}</span>
      <span>${item.tire}</span>
      <span>${item.rpm}</span>
      <span>${item.speed}</span>
    `;
    historyList.appendChild(row);
  });
}

generateComparisonTable();
renderHistory();
buildFilterOptions();
