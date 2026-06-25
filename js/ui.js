/* ============================
   ページ切り替え
============================ */
function switchPage(pageName) {
  document.querySelectorAll('.view-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  if (pageName === 'main') {
    document.getElementById('pageMain').classList.add('active');
    document.getElementById('navMainBtn').classList.add('active');
  } else if (pageName === 'history') {
    document.getElementById('pageHistory').classList.add('active');
    document.getElementById('navHistoryBtn').classList.add('active');
    updateAllHistoryComponents();
  } else if (pageName === 'karte') {
    document.getElementById('karte').classList.add('active');
  }
}

/* ============================
   設定モーダル
============================ */
const settingsModal = document.getElementById("settingsModal");
const navSettingsBtn = document.getElementById("navSettingsBtn");
const modalCloseBtn = document.getElementById("modalCloseBtn");

navSettingsBtn.addEventListener("click", () => {
  settingsModal.classList.add("active");
});

modalCloseBtn.addEventListener("click", () => {
  settingsModal.classList.remove("active");
  if (analyser) analyser.minDecibels = parseFloat(inputNoise.value) || -120;
  updateSliderLabels();
});

/* ============================
   スライダーイベント
============================ */
[slideVolt, slideGear, slideTire].forEach(el =>
  el.addEventListener("input", updateSliderLabels)
);

inputPhase.addEventListener("change", updateSliderLabels);

/* ============================
   リサイズ / orientation ハンドラ
============================ */
function handleResize() {
  try {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || Math.max(220, Math.round(window.innerHeight * 0.25));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    drawSpectrumGrid();
    renderWaveform();
  } catch (e) {}
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => {
  setTimeout(handleResize, 250);
});

/* ============================
   初期化
============================ */
updateSliderLabels();
updateAllHistoryComponents();
requestAnimationFrame(mainLoop);
