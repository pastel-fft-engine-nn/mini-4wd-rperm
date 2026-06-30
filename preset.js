const PRESET = {
  voltage: document.getElementById("voltageRange"),
  gear: document.getElementById("gearRange"),
  tire: document.getElementById("tireRange"),

  voltageLabel: document.getElementById("voltageLabel"),
  gearLabel: document.getElementById("gearLabel"),
  tireLabel: document.getElementById("tireLabel"),

  noise: document.getElementById("noiseRange"),
  rpmCal: document.getElementById("rpmCalRange"),
  load: document.getElementById("loadFactorRange"),

  noiseLabel: document.getElementById("noiseLabel"),
  rpmCalLabel: document.getElementById("rpmCalLabel"),
  loadLabel: document.getElementById("loadFactorLabel"),
  poleLabel: document.getElementById("poleMotorLabel"),
};

const gearOptions = ["3.5:1", "3.7:1", "4.0:1", "4.2:1", "4.5:1"];

function loadPresets() {
  const sv = localStorage.getItem("preset_voltage");
  const sg = localStorage.getItem("preset_gearIndex");
  const st = localStorage.getItem("preset_tire");
  const sn = localStorage.getItem("preset_noise");
  const sr = localStorage.getItem("preset_rpmCal");
  const sl = localStorage.getItem("preset_load");

  if (sv !== null) PRESET.voltage.value = sv;
  if (sg !== null) PRESET.gear.value = sg;
  if (st !== null) PRESET.tire.value = st;
  if (sn !== null) PRESET.noise.value = sn;
  if (sr !== null) PRESET.rpmCal.value = sr;
  if (sl !== null) PRESET.load.value = sl;

  updatePresetLabels();
}

function updatePresetLabels() {
  PRESET.voltageLabel.textContent = parseFloat(PRESET.voltage.value).toFixed(1) + " V";
  PRESET.gearLabel.textContent = gearOptions[parseInt(PRESET.gear.value, 10)];
  PRESET.tireLabel.textContent = parseFloat(PRESET.tire.value).toFixed(1) + " mm";

  PRESET.noiseLabel.textContent = PRESET.noise.value + " dB";
  PRESET.rpmCalLabel.textContent = parseFloat(PRESET.rpmCal.value).toFixed(2);
  PRESET.loadLabel.textContent = PRESET.load.value + "%";
  PRESET.poleLabel.textContent = "2";
}

function savePresets() {
  localStorage.setItem("preset_voltage", PRESET.voltage.value);
  localStorage.setItem("preset_gearIndex", PRESET.gear.value);
  localStorage.setItem("preset_tire", PRESET.tire.value);
  localStorage.setItem("preset_noise", PRESET.noise.value);
  localStorage.setItem("preset_rpmCal", PRESET.rpmCal.value);
  localStorage.setItem("preset_load", PRESET.load.value);
}

PRESET.voltage.addEventListener("input", () => {
  updatePresetLabels();
  savePresets();
  generateComparisonTable();
});

PRESET.gear.addEventListener("input", () => {
  updatePresetLabels();
  savePresets();
  generateComparisonTable();
});

PRESET.tire.addEventListener("input", () => {
  updatePresetLabels();
  savePresets();
  generateComparisonTable();
});

PRESET.noise.addEventListener("input", () => {
  updatePresetLabels();
  savePresets();
});

PRESET.rpmCal.addEventListener("input", () => {
  updatePresetLabels();
  savePresets();
});
PRESET.load.addEventListener("input", () => {
  updatePresetLabels();
  savePresets();
});

loadPresets();