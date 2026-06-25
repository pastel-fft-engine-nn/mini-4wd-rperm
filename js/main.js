/* ============================
   定数・変数
============================ */
const GEAR_VALUES = [3.5, 3.7, 4.0, 4.1, 4.2, 4.5, 5.0];
const MATRIX_VOLTS = [3.4, 3.3, 3.2, 3.1, 3.0, 2.9, 2.8, 2.7, 2.6, 2.5, 2.4, 2.3, 2.2];

let audioCtx = null;
let analyser = null;
let micSource = null;
let running = false;
let locked = false;

let spectrumArray = null;
const fftSize = 8192;

let currentSessionRPMs = [];

let historyChart = null;
let radarChart = null;
let beforeAfterChart = null;
let lockedData = null;

/* ============================
   DOM 取得
============================ */
const startBtn = document.getElementById("startBtn");
const lockBtn = document.getElementById("lockBtn");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const canvas = document.getElementById("spectrumCanvas");
const ctx = canvas.getContext("2d");

const slideVolt = document.getElementById("slideVolt");
const slideGear = document.getElementById("slideGear");
const slideTire = document.getElementById("slideTire");
const inputPoles = document.getElementById("inputPoles");
const inputNoise = document.getElementById("inputNoise");
const inputCalib = document.getElementById("inputCalib");
const inputPhase = document.getElementById("inputPhase");

const exportCSVBtn = document.getElementById("exportCSV");
const exportExcelBtn = document.getElementById("exportExcel");
const clearAllBtn = document.getElementById("clearAllBtn");

/* ============================
   Web Audio 初期化
============================ */
async function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.4;
    spectrumArray = new Uint8Array(analyser.frequencyBinCount);
  }
  analyser.minDecibels = parseFloat(inputNoise.value) || -120;

  if (!micSource) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    micSource = audioCtx.createMediaStreamSource(stream);
    micSource.connect(analyser);
  }
}

/* ============================
   FFT → 周波数推定（ピーク補間）
============================ */
function estimateFrequencyAdvanced() {
  if (!analyser) return 0;
  analyser.getByteFrequencyData(spectrumArray);
  const sampleRate = audioCtx.sampleRate;
  const binResolution = sampleRate / fftSize;

  const minBin = Math.floor(80 / binResolution);
  const maxBin = Math.min(Math.floor(3000 / binResolution), spectrumArray.length - 2);

  let maxVal = 0;
  let maxIndex = -1;
  for (let i = minBin; i <= maxBin; i++) {
    if (spectrumArray[i] > maxVal) {
      maxVal = spectrumArray[i];
      maxIndex = i;
    }
  }
  if (maxIndex <= minBin || maxVal < 15) return 0;

  const yAlpha = spectrumArray[maxIndex - 1];
  const yBeta  = spectrumArray[maxIndex];
  const yGamma = spectrumArray[maxIndex + 1];

  const denominator = 2 * (2 * yBeta - yAlpha - yGamma);
  let p = 0;
  if (denominator !== 0) {
    p = (yGamma - yAlpha) / denominator;
  }

  return (maxIndex + p) * binResolution;
}

/* ============================
   周波数→RPM/速度計算
============================ */
function calculateMetrics(freq) {
  if (freq <= 0) return { motorRPM: 0, speed: 0 };
  const targetGear = GEAR_VALUES[slideGear.value];
  const tireDiameter = parseFloat(slideTire.value);
  const poles = parseInt(inputPoles.value) || 1;
  const calib = parseFloat(inputCalib.value) || 1.0;

  let motorRPM = (freq * 60) / poles;
  motorRPM *= calib;

  const axleRPM = motorRPM / targetGear;
  const speed = axleRPM * (Math.PI * (tireDiameter / 1000)) * 60 / 1000;

  return { motorRPM, speed };
}

/* ============================
   スペクトラム描画
============================ */
function drawSpectrumGrid() {
  (function ensureCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || Math.max(320, window.innerWidth - 32);
    const h = canvas.clientHeight || Math.max(220, Math.round(window.innerHeight * 0.25));
    const targetW = Math.floor(w * dpr);
    const targetH = Math.floor(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  })();

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  if (!w || !h) return;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  const targetFreqs = [200, 500, 1000, 1500, 2000, 2500];
  ctx.strokeStyle = "rgba(75, 85, 99, 0.4)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px sans-serif";

  targetFreqs.forEach(f => {
    const x = ((f - 80) / (3000 - 80)) * w;
    if (x >= 0 && x <= w) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillText(f, x + 4, h - 6);
    }
  });

  for (let y = h / 4; y < h; y += h / 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const scanY = (Date.now() % 3000) / 3000 * h;
  ctx.fillStyle = "rgba(37, 99, 235, 0.15)";
  ctx.fillRect(0, scanY, w, 2);

  ctx.restore();
}

function renderWaveform() {
  if (!analyser) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  if (!w || !h) return;

  ctx.save();
  ctx.scale(dpr, dpr);
  analyser.getByteFrequencyData(spectrumArray);
  ctx.fillStyle = "rgba(37, 99, 235, 0.7)";

  for (let i = 0; i < spectrumArray.length; i++) {
    const f = i * audioCtx.sampleRate / fftSize;
    if (f < 80 || f > 3000) continue;
    const x = ((f - 80) / (3000 - 80)) * w;
    const barHeight = (spectrumArray[i] / 255) * h;
    ctx.fillRect(x, h - barHeight, 2, barHeight);
  }
  ctx.restore();
}

/* ============================
   メインループ
============================ */
function mainLoop() {
  drawSpectrumGrid();

  if (running && !locked) {
    const freq = estimateFrequencyAdvanced();
    const { motorRPM, speed } = calculateMetrics(freq);

    if (motorRPM > 0) {
      currentSessionRPMs.push(motorRPM);
    }

    document.getElementById("rpmValue").textContent = Math.round(motorRPM) + " RPM";
    document.getElementById("speedValue").textContent = speed.toFixed(1) + " km/h";

    if (currentSessionRPMs.length > 0) {
      const max = Math.max(...currentSessionRPMs);
      const min = Math.min(...currentSessionRPMs);
      const avg = currentSessionRPMs.reduce((a, b) => a + b, 0) / currentSessionRPMs.length;

      document.getElementById("sessMax").textContent = Math.round(max);
      document.getElementById("sessMin").textContent = Math.round(min);
      document.getElementById("sessAvg").textContent = Math.round(avg);
      document.getElementById("sessCount").textContent = currentSessionRPMs.length;

      generateMatrixTable(max, parseFloat(slideVolt.value));
    }

    renderWaveform();
  } else {
    renderWaveform();
  }

  requestAnimationFrame(mainLoop);
}

/* ============================
   マトリクス表生成
============================ */
function generateMatrixTable(baseMotorRPM, currentVolt) {
  const table = document.getElementById("matrixTable");
  table.innerHTML = "";
  const tire = parseFloat(slideTire.value);
  const curVoltStr = currentVolt.toFixed(1);

  let theadHTML = `<thead><tr><th>電圧</th><th style="color: var(--accent-color);">モーター<br><span style="font-size:10px;">RPM</span></th>`;
  GEAR_VALUES.forEach(g => {
    theadHTML += `<th style="color: #f59e0b;">${g.toFixed(1)}:1<br><span style="font-size:9px; font-weight:normal; opacity:0.8;">RPM / KM/H</span></th>`;
  });
  theadHTML += `</tr></thead>`;

  let tbodyHTML = "<tbody>";
  MATRIX_VOLTS.forEach(v => {
    const isCurrent = (v.toFixed(1) === curVoltStr);
    const rowClass = isCurrent ? ' class="current-volt-row"' : '';

    tbodyHTML += `<tr${rowClass}><td>${v.toFixed(1)}V</td>`;

    let estMotorRPM = 0;
    if (baseMotorRPM > 0 && currentVolt > 0) {
      estMotorRPM = baseMotorRPM * (v / currentVolt);
    }
    tbodyHTML += `<td style="font-weight:500;">${estMotorRPM > 0 ? Math.round(estMotorRPM) + ' RPM' : "---"}</td>`;

    GEAR_VALUES.forEach(g => {
      if (estMotorRPM > 0) {
        const wheelRPM = estMotorRPM / g;
        const speed = wheelRPM * (Math.PI * (tire / 1000)) * 60 / 1000;
        tbodyHTML += `<td>
          <div style="font-weight:bold;">${Math.round(wheelRPM)} RPM</div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${speed.toFixed(1)} km/h</div>
        </td>`;
      } else {
        tbodyHTML += `<td>
          <div style="opacity:0.4;">---</div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">--- km/h</div>
        </td>`;
      }
    });

    tbodyHTML += `</tr>`;
  });

  table.innerHTML = theadHTML + tbodyHTML;
}

/* ============================
   履歴管理
============================ */
function getHistorySafe() {
  try {
    const raw = localStorage.getItem("rpmHistoryV3");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.warn("history parse error", e);
    return [];
  }
}

function updateMotorCompareTable(history) {
  const tbody = document.getElementById("motorCompareTableBody");
  tbody.innerHTML = "";

  const motorMap = {};
  history.forEach(item => {
    if (!motorMap[item.name]) motorMap[item.name] = [];
    motorMap[item.name].push(item);
  });

  const names = Object.keys(motorMap);
  if (names.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--text-muted);">データがありません。</td></tr>`;
    return;
  }

  names.forEach(name => {
    const runs = motorMap[name];
    const maxRPM = Math.max(...runs.map(r => r.maxRpm));
    const maxSpeed = Math.max(...runs.map(r => r.maxSpeed));
    const avgRPM = Math.round(runs.reduce((s, r) => s + r.avgRpm, 0) / runs.length);
    const volts = [...new Set(runs.map(r => r.volt + "V"))].join(", ");

    const avgStab = runs.reduce((s, r) => s + (r.stabilityIndex || 0), 0) / runs.length;
    const avgEff = runs.reduce((s, r) => s + (r.efficiencyIndex || 0), 0) / runs.length;

    const beforeRuns = runs.filter(r => r.breakInPhase === "before");
    const afterRuns = runs.filter(r => r.breakInPhase === "after");
    const beforeCount = beforeRuns.length;
    const afterCount = afterRuns.length;

    let growthRate = "-";
    if (beforeRuns.length > 0 && afterRuns.length > 0) {
      const beforeAvg = beforeRuns.reduce((s, r) => s + r.avgRpm, 0) / beforeRuns.length;
      const afterAvg = afterRuns.reduce((s, r) => s + r.avgRpm, 0) / afterRuns.length;
      growthRate = (((afterAvg - beforeAvg) / beforeAvg) * 100).toFixed(1) + "%";
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>🏎️ <b>${name}</b></td>
      <td>${volts}</td>
      <td style="color:#ef4444; font-weight:bold;">${maxRPM} RPM</td>
      <td>${avgRPM} RPM</td>
      <td style="color:#10b981; font-weight:bold;">${maxSpeed.toFixed(1)} km/h</td>
      <td>${avgStab.toFixed(1)}</td>
      <td>${avgEff.toFixed(1)}</td>
      <td>${beforeCount} / ${afterCount}</td>
      <td>${growthRate}</td>
    `;
    tbody.appendChild(tr);
  });
}

function populateFilterOptions(history) {
  const names = [...new Set(history.map(h => h.name))];
  const volts = [...new Set(history.map(h => h.volt))].sort();
  const gears = [...new Set(history.map(h => h.gear))].sort();
  const tires = [...new Set(history.map(h => h.tire))].sort();

  updateSelectOptions("filterName", names);
  updateSelectOptions("filterVolt", volts, "V");
  updateSelectOptions("filterGear", gears, ":1");
  updateSelectOptions("filterTire", tires, "mm");
}

function updateSelectOptions(elementId, array, suffix = "") {
  const select = document.getElementById(elementId);
  const currentVal = select.value;
  select.innerHTML = '<option value="">すべて</option>';

  array.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item + suffix;
    if (item.toString() === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

function applyFilters() {
  const history = getHistorySafe();
  const fName = document.getElementById("filterName").value;
  const fVolt = document.getElementById("filterVolt").value;
  const fGear = document.getElementById("filterGear").value;
  const fTire = document.getElementById("filterTire").value;

  const filtered = history.filter(h => {
    return (!fName || h.name === fName) &&
           (!fVolt || String(h.volt) === String(fVolt)) &&
           (!fGear || String(h.gear) === String(fGear)) &&
           (!fTire || String(h.tire) === String(fTire));
  });

  renderHistoryRows(filtered);
  drawHistoryChart(filtered);
}

function renderHistoryRows(data) {
  const tbody = document.getElementById("historyTable");
  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--text-muted);">データがありません。</td></tr>`;
    return;
  }

  data.forEach(item => {
    const phaseLabel = item.breakInPhase === "after" ? "🔥 After" : "❄ Before";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.date}</td>
      <td style="font-weight:bold;">${item.name}</td>
      <td style="color:#ef4444; font-weight:bold;">${item.maxRpm} RPM</td>
      <td>${item.avgRpm} RPM</td>
      <td>${item.volt} V</td>
      <td style="font-weight:bold;">${item.gear}:1</td>
      <td>${item.tire} mm</td>
      <td>${phaseLabel}</td>
      <td