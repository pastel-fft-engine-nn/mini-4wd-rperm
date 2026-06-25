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
   FFT → 周波数推定
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
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 200;

  canvas.width = w * dpr;
  canvas.height = h * dpr;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  for (let y = h / 4; y < h; y += h / 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.restore();
}

function renderWaveform() {
  if (!analyser) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

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

    if (motorRPM > 0) currentSessionRPMs.push(motorRPM);

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

  let theadHTML = `<thead><tr><th>電圧</th><th>モーターRPM</th>`;
  GEAR_VALUES.forEach(g => {
    theadHTML += `<th>${g.toFixed(1)}:1<br>RPM / KM/H</th>`;
  });
  theadHTML += `</tr></thead>`;

  let tbodyHTML = "<tbody>";
  MATRIX_VOLTS.forEach(v => {
    const isCurrent = (v.toFixed(1) === curVoltStr);
    const rowClass = isCurrent ? ' class="current-volt-row"' : '';

    tbodyHTML += `<tr${rowClass}><td>${v.toFixed(1)}V</td>`;

    let estMotorRPM = baseMotorRPM * (v / currentVolt);
    tbodyHTML += `<td>${Math.round(estMotorRPM)}</td>`;

    GEAR_VALUES.forEach(g => {
      const wheelRPM = estMotorRPM / g;
      const speed = wheelRPM * (Math.PI * (tire / 1000)) * 60 / 1000;
      tbodyHTML += `<td>${Math.round(wheelRPM)} / ${speed.toFixed(1)}</td>`;
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
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

  Object.keys(motorMap).forEach(name => {
    const runs = motorMap[name];
    const maxRPM = Math.max(...runs.map(r => r.maxRpm));
    const avgRPM = Math.round(runs.reduce((s, r) => s + r.avgRpm, 0) / runs.length);
    const maxSpeed = Math.max(...runs.map(r => r.maxSpeed));
    const volts = [...new Set(runs.map(r => r.volt))].join(", ");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${name}</td>
      <td>${volts}</td>
      <td>${maxRPM}</td>
      <td>${avgRPM}</td>
      <td>${maxSpeed.toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function populateFilterOptions(history) {
  const names = [...new Set(history.map(h => h.name))];
  const volts = [...new Set(history.map(h => h.volt))];
  const gears = [...new Set(history.map(h => h.gear))];
  const tires = [...new Set(history.map(h => h.tire))];

  updateSelect("filterName", names);
  updateSelect("filterVolt", volts);
  updateSelect("filterGear", gears);
  updateSelect("filterTire", tires);
}

function updateSelect(id, arr) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">すべて</option>`;
  arr.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
}

function applyFilters() {
  const history = getHistorySafe();
  const fName = filterName.value;
  const fVolt = filterVolt.value;
  const fGear = filterGear.value;
  const fTire = filterTire.value;

  const filtered = history.filter(h =>
    (!fName || h.name === fName) &&
    (!fVolt || String(h.volt) === fVolt) &&
    (!fGear || String(h.gear) === fGear) &&
    (!fTire || String(h.tire) === fTire)
  );

  renderHistoryRows(filtered);
  drawHistoryChart(filtered);
}

function renderHistoryRows(data) {
  const tbody = document.getElementById("historyTable");
  tbody.innerHTML = "";

  data.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.date}</td>
      <td>${item.name}</td>
      <td>${item.maxRpm}</td>
      <td>${item.avgRpm}</td>
      <td>${item.volt}</td>
      <td>${item.gear}</td>
      <td>${item.tire}</td>
      <td>${item.breakInPhase}</td>
      <td><button class="btn-danger btn-sm" onclick="deleteRecord(${item.id})">削除</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* ============================
   履歴グラフ
============================ */
function drawHistoryChart(data) {
  const ctxH = document.getElementById("historyChart").getContext("2d");

  if (historyChart) historyChart.destroy();

  historyChart = new Chart(ctxH, {
    type: "line",
    data: {
      labels: data.map(d => d.date + " / " + d.name),
      datasets: [
        {
          label: "MAX RPM",
          data: data.map(d => d.maxRpm),
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.2)"
        },
        {
          label: "AVG RPM",
          data: data.map(d => d.avgRpm),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.2)"
        }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

/* ============================
   CSV / Excel / 削除
============================ */
exportCSVBtn.addEventListener("click", () => {
  const history = getHistorySafe();
  if (!history.length) return alert("履歴がありません");

  const header = ["date","name","maxRpm","avgRpm","volt","gear","tire","breakInPhase","maxSpeed"];
  const rows = history.map(h => [
    h.date, h.name, h.maxRpm, h.avgRpm, h.volt, h.gear, h.tire, h.breakInPhase, h.maxSpeed
  ]);

  let csv = header.join(",") + "\n";
  rows.forEach(r => csv += r.join(",") + "\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rpm_history.csv";
  a.click();
  URL.revokeObjectURL(url);
});

exportExcelBtn.addEventListener("click", () => {
  const history = getHistorySafe();
  if (!history.length) return alert("履歴がありません");

  const wsData = [["date","name","maxRpm","avgRpm","volt","gear","tire","breakInPhase","maxSpeed"]];
  history.forEach(h => wsData.push([
    h.date, h.name, h.maxRpm, h.avgRpm, h.volt, h.gear, h.tire, h.breakInPhase, h.maxSpeed
  ]));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "RPM History");
  XLSX.writeFile(wb, "rpm_history.xlsx");
});

clearAllBtn.addEventListener("click", () => {
  if (!confirm("履歴をすべて削除しますか？")) return;
  localStorage.removeItem("rpmHistoryV3");
  updateAllHistoryComponents();
});

function deleteRecord(id) {
  const history = getHistorySafe().filter(h => h.id !== id);
  localStorage.setItem("rpmHistoryV3", JSON.stringify(history));
  updateAllHistoryComponents();
}

/* ============================
   計測ボタン / ロック / 保存 / リセット
============================ */
startBtn.addEventListener("click", async () => {
  try {
    await initAudio();
    if (audioCtx.state === "suspended") await audioCtx.resume();

    running = !running;
    if (running) {
      locked = false;
      currentSessionRPMs = [];
      startBtn.textContent = "⏸ 停止";
      lockBtn.textContent = "🔒";
    } else {
      startBtn.textContent = "▶ 計測";
    }
  } catch (err) {
    alert("マイクのアクセス許可が必要です: " + err);
  }
});

lockBtn.addEventListener("click", () => {
  if (!currentSessionRPMs.length) return;

  locked = !locked;
  lockBtn.textContent = locked ? "🔓" : "🔒";

  if (locked) running = false;
});

saveBtn.addEventListener("click", () => {
  if (!currentSessionRPMs.length) return;

  const motorName = prompt("モーター名を入力:", "カスタムモーター");
  if (motorName === null) return;

  const max = Math.max(...currentSessionRPMs);
  const avg = currentSessionRPMs.reduce((a, b) => a + b, 0) / currentSessionRPMs.length;

  const gear = GEAR_VALUES[slideGear.value];
  const tire = parseFloat(slideTire.value);
  const wheelRPM = max / gear;
  const maxSpeed = wheelRPM * (Math.PI * (tire / 1000)) * 60 / 1000;

  const now = new Date();
  const dateStr =
    `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,"0")}/${String(now.getDate()).padStart(2,"0")} ` +
    `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

  const history = getHistorySafe();

  history.push({
    id: Date.now(),
    date: dateStr,
    name: motorName.trim(),
    maxRpm: Math.round(max),
    avgRpm: Math.round(avg),
    volt: parseFloat(slideVolt.value),
    gear: gear,
    tire: tire,
    breakInPhase: inputPhase.value,
    maxSpeed: maxSpeed
  });

  localStorage.setItem("rpmHistoryV3", JSON.stringify(history));
  updateAllHistoryComponents();

  locked = false;
  lockBtn.textContent = "🔒";
  currentSessionRPMs = [];
});

resetBtn.addEventListener("click", () => {
  currentSessionRPMs = [];
  locked = false;
  lockBtn.textContent = "🔒";

  document.getElementById("sessMax").textContent = "0";
  document.getElementById("sessMin").textContent = "0";
  document.getElementById("sessAvg").textContent = "0";
  document.getElementById("sessCount").textContent = "0";
  document.getElementById("rpmValue").textContent = "0 RPM";
  document.getElementById("speedValue").textContent = "0.0 km/h";
});

/* ============================
   全履歴更新
============================ */
function updateAllHistoryComponents() {
  const history = getHistorySafe();
  populateFilterOptions(history);
  renderHistoryRows(history);
  drawHistoryChart(history);
  updateMotorCompareTable(history);
}

/* ============================
   リサイズ
============================ */
function handleResize() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 200;

  canvas.width = w * dpr;
  canvas.height = h * dpr;

  drawSpectrumGrid();
  renderWaveform();
}

window.addEventListener("resize", handleResize);
window.addEventListener("orientationchange", () => setTimeout(handleResize, 250));

/* ============================
   初期化
============================ */
updateAllHistoryComponents();
requestAnimationFrame(mainLoop);
