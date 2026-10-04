/* ============================================================
   Hanzi Studio — Main Application Logic
   Supports single characters AND multi-character words:
   - Word search (Chinese, English, or pinyin)
   - Info card: pinyin + definition per character
   - Animation tab: stroke order, chained across all characters
   - Practice tab: Hanzi Writer quiz per character
   - 米字格 (rice-grid) backgrounds for all canvases
   - Pinyin autocomplete (plain latin → character suggestions)
   - i18n (English / Russian) with live switching
   ============================================================ */

(function () {
  'use strict';

  // ---- State ----
  let currentChars = [];    // array of individual CJK chars for the current query
  let currentQuery = '';    // raw query as typed
  let animWriters = [];     // HanziWriter instances for animation tab (one per char)
  let isAnimLooping = false;
  let isAnimating = false;  // an animation is currently running (incl. loop)
  let animationSpeed = 'medium'; // slow | medium | fast
  let quizWriters = {};     // char -> HanziWriter instance for practice tab
  let practicePos = 0;      // which char is being practiced
  let quizActive = false;
  let currentNextStroke = 0; // upcoming stroke number (0-based) for hint highlighting
  let outlineVisible = true; // outline contour visibility
  let practiceSize = 0;      // cached canvas size for practice tab (avoids layout-dependent recalc)
  let history = [];
  let autoSelected = false;

  // ---- DOM references ----
  const $ = (sel) => document.querySelector(sel);
  const input          = $('#charInput');
  const searchBtn      = $('#searchBtn');
  const randomBtn      = $('#randomBtn');
  const themeToggle    = $('#themeToggle');
  const splash         = $('#splash');
  const resultPanel    = $('#resultPanel');
  const infoHanzi      = $('#infoHanzi');
  const infoPinyin     = $('#infoPinyin');
  const infoDefinition = $('#infoDefinition');
  const infoRadical    = $('#infoRadical');
  const animTarget     = $('#animationTarget');
  const practiceTarget = $('#practiceTarget');
  const playBtn        = $('#playBtn');
  const loopBtn        = $('#loopBtn');
  const speedBtns      = document.querySelectorAll('.speed-btn');
  const strokeCount    = $('#strokeCount');
  const outlineToggleBtn = $('#outlineToggleBtn');
  const resetQuizBtn   = $('#resetQuizBtn');
  const showHintBtn    = $('#showHintBtn');
  const prevCharBtn    = $('#prevCharBtn');
  const nextCharBtn    = $('#nextCharBtn');
  const charCounter    = $('#charCounter');
  const quizStatus     = $('#quizStatus');
  const quizProgress   = $('#quizProgress');
  const historyBar     = $('#historyBar');
  const historyChips   = $('#historyChips');
  const autoList       = $('#autocompleteList');
  const langBtns       = document.querySelectorAll('.lang-btn');

  // ---- Init ----
  function init() {
    loadTheme();
    loadLanguage();
    loadOutlinePreference();
    bindEvents();
    if (location.hash && location.hash.length > 1) {
      const q = decodeURIComponent(location.hash.slice(1));
      if (q) searchCharacter(q);
    }
  }

  // ---- Theme ----
  function loadTheme() {
    const saved = localStorage.getItem('hanzi-theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeToggle.textContent = '☀️';
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeToggle.textContent = '🌙';
    }
  }
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('hanzi-theme', 'light');
      themeToggle.textContent = '🌙';
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('hanzi-theme', 'dark');
      themeToggle.textContent = '☀️';
    }
    // Refresh practice canvas to apply new drawing / stroke / outline colors
    if (currentChars.length) {
      loadPracticeChar();
    }
  }

  // ---- Language events ----
  function onLangChange() {
    // Re-render info panel, quiz status, and dynamic text that uses t()
    if (currentChars.length) {
      renderInfoCard(
        HANZI_DICT[currentQuery]
          ? { char: currentQuery, pinyin: HANZI_DICT[currentQuery][0], definition: HANZI_DICT[currentQuery][1] }
          : null
      );
    }
    // Update quiz status if active
    const writer = getQuizWriter();
    const ch = currentChars[practicePos];
    if (writer && ch) {
      if (quizActive) {
        quizStatus.textContent = t('practice.draw_strokes', { char: ch });
      } else {
        quizStatus.textContent = t('practice.draw');
      }
    }
    // Update outline button
    outlineToggleBtn.innerHTML = outlineVisible ? t('outline.hide') : t('outline.show');
    // Update loop button
    loopBtn.innerHTML = isAnimLooping ? t('animation.stop') : t('animation.loop');
    // Update stroke count
    updateStrokeCount();
    // Update history label
    document.querySelector('.history-label').innerHTML = t('history.label');
    // Refresh autocomplete if visible
    if (!autoList.classList.contains('hidden')) {
      showAutocomplete();
    }
    // Reset active lang button
    langBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.lang === currentLang));
  }

  // ---- Grid color helpers ----
  function gridLineColor() {
    return isDarkTheme() ? '#555' : '#ccc';
  }
  function gridDiagColor() {
    return isDarkTheme() ? '#444' : '#ddd';
  }
  function gridInnerColor() {
    return isDarkTheme() ? '#3a3a50' : '#eee';
  }

  function drawingColor() {
    return isDarkTheme() ? '#ddd' : '#333';
  }

  function isDarkTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  // ---- 米字格 (rice-grid) SVG builder ----
  function createGridSvg(width, height, padding) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttributeNS(null, 'width', width);
    svg.setAttributeNS(null, 'height', height);
    svg.style.display = 'block';

    const p = padding || 0;
    const x0 = p;
    const y0 = p;
    const x1 = width - p;
    const y1 = height - p;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    addLine(svg, x0, y0, x1, y0, gridLineColor(), 1);
    addLine(svg, x1, y0, x1, y1, gridLineColor(), 1);
    addLine(svg, x1, y1, x0, y1, gridLineColor(), 1);
    addLine(svg, x0, y1, x0, y0, gridLineColor(), 1);
    addLine(svg, x0, cy, x1, cy, gridDiagColor(), 0.5);
    addLine(svg, cx, y0, cx, y1, gridDiagColor(), 0.5);
    addLine(svg, x0, y0, x1, y1, gridDiagColor(), 0.5);
    addLine(svg, x1, y0, x0, y1, gridDiagColor(), 0.5);

    const inset = (x1 - x0) * 0.1;
    const ix0 = x0 + inset;
    const iy0 = y0 + inset;
    const ix1 = x1 - inset;
    const iy1 = y1 - inset;
    const dash = '2,3';
    addLine(svg, ix0, iy0, ix1, iy0, gridInnerColor(), 0.5, dash);
    addLine(svg, ix1, iy0, ix1, iy1, gridInnerColor(), 0.5, dash);
    addLine(svg, ix1, iy1, ix0, iy1, gridInnerColor(), 0.5, dash);
    addLine(svg, ix0, iy1, ix0, iy0, gridInnerColor(), 0.5, dash);

    return svg;
  }

  function addLine(svg, x1, y1, x2, y2, color, width, dash) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttributeNS(null, 'x1', x1);
    line.setAttributeNS(null, 'y1', y1);
    line.setAttributeNS(null, 'x2', x2);
    line.setAttributeNS(null, 'y2', y2);
    line.setAttributeNS(null, 'stroke', color);
    line.setAttributeNS(null, 'stroke-width', width);
    if (dash) line.setAttributeNS(null, 'stroke-dasharray', dash);
    svg.appendChild(line);
  }

  // ---- Build an SVG with grid + render HanziWriter into it ----
  function createGriddedWriter(container, char, size, padding, extraOpts) {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = size + 'px';
    wrapper.style.height = size + 'px';
    container.appendChild(wrapper);

    const gridSvg = createGridSvg(size, size, padding);
    gridSvg.style.position = 'absolute';
    gridSvg.style.top = '0';
    gridSvg.style.left = '0';
    gridSvg.style.pointerEvents = 'none';
    wrapper.appendChild(gridSvg);

    const hwDiv = document.createElement('div');
    hwDiv.style.width = size + 'px';
    hwDiv.style.height = size + 'px';
    wrapper.appendChild(hwDiv);

    const writer = HanziWriter.create(hwDiv, char, Object.assign({
      width: size,
      height: size,
      padding: padding,
      strokeColor: '#4a6cf7',
      radicalColor: '#e74c3c',
      outlineColor: '#ccc',
      strokeAnimationSpeed: 1.4,
      delayBetweenStrokes: 160,
      showCharacter: true,
      showOutline: true,
    }, extraOpts || {}));
    return writer;
  }

  // ---- Character extraction ----
  function extractChars(query) {
    const out = [];
    for (const ch of query) {
      const code = ch.codePointAt(0);
      if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF)) out.push(ch);
    }
    return out;
  }

  // ---- Dictionary lookup helpers ----
  function lookupChar(ch) {
    // Use RU_DICT when language is Russian, fall back to HANZI_DICT
    const dict = currentLang === 'ru' && RU_DICT[ch] ? RU_DICT : HANZI_DICT;
    const entry = dict[ch];
    return entry ? { char: ch, pinyin: entry[0], definition: entry[1] } : null;
  }

  // ---- Pinyin autocomplete ----
  function showAutocomplete() {
    const val = input.value.trim();
    if (val.length < 2 || extractChars(val).length > 0 || /[\u4e00-\u9fff\u3400-\u4dbf]/.test(val)) {
      autoList.classList.add('hidden');
      return;
    }

    const suggestions = autocompletePinyin(val);
    if (!suggestions || suggestions.length === 0) {
      autoList.classList.add('hidden');
      return;
    }

    autoList.innerHTML = suggestions
      .map((s, i) => {
        // Look up definition in current language dynamically
        const info = lookupChar(s.char);
        const def = info ? info.definition : s.definition;
        return `<button class="auto-item" data-index="${i}" data-char="${s.char}"><span class="auto-char">${s.char}</span> <span class="auto-pinyin">[${s.pinyin}]</span> <span class="auto-def">${def}</span></button>`;
      })
      .join('');
    autoList.classList.remove('hidden');
  }

  function selectAuto(char) {
    autoSelected = true;
    input.value = char;
    autoList.classList.add('hidden');
    searchCharacter(char);
  }

  // ---- Search ----
  function searchCharacter(query) {
    if (!query || query.trim().length === 0) return;
    query = query.trim();

    const chars = extractChars(query);
    let fullInfo = null;

    if (chars.length === 0) {
      fullInfo = lookupHanzi(query);
      if (fullInfo) {
        input.value = fullInfo.char;
        query = fullInfo.char;
        currentChars = extractChars(query);
      } else {
        showError(t('error.default', { q: query }));
        return;
      }
    } else {
      currentChars = chars;
      fullInfo = HANZI_DICT[query]
        ? { char: query, pinyin: HANZI_DICT[query][0], definition: HANZI_DICT[query][1] }
        : null;
    }

    if (currentChars.length === 0) {
      showError(t('error.no_chinese'));
      return;
    }

    currentQuery = query;
    try { location.hash = encodeURIComponent(query); } catch (e) { /* ignore */ }

    splash.classList.add('hidden');
    resultPanel.classList.remove('hidden');

    renderInfoCard(fullInfo);
    loadAnimationWriters();
    setupPractice();
    addToHistory(query);
    resetAnimationButtons();
    resetQuizState();
  }

  function showError(msg) {
    splash.classList.add('hidden');
    resultPanel.classList.remove('hidden');
    infoHanzi.textContent = '⚠️';
    infoPinyin.textContent = '';
    infoDefinition.textContent = msg;
    infoRadical.textContent = '';
    animTarget.innerHTML = '';
    practiceTarget.innerHTML = '';
    animWriters = [];
    quizWriters = {};
  }

  // ---- Info card ----
  function renderInfoCard(wordInfo) {
    if (currentChars.length === 1) {
      const info = lookupChar(currentChars[0]);
      infoHanzi.textContent = info ? info.char : currentChars[0];
      infoPinyin.textContent = info ? `[${info.pinyin}]` : '';
      infoDefinition.textContent = info ? info.definition : t('error.no_dict');
      infoDefinition.classList.remove('word-defs');
    } else {
      infoHanzi.textContent = wordInfo ? wordInfo.char : currentQuery;
      const pinyins = currentChars.map((c) => {
        const info = lookupChar(c);
        return info ? info.pinyin : c;
      });
      infoPinyin.textContent = `[${pinyins.join(' ')}]`;
      if (wordInfo && currentChars.length === currentQuery.length) {
        infoDefinition.textContent = wordInfo.definition;
      } else {
        infoDefinition.textContent = '';
      }
      infoDefinition.classList.add('word-defs');
      infoDefinition.innerHTML += currentChars
        .map((c) => {
          const info = lookupChar(c);
          return info
            ? `<div class="word-def"><b>${c}</b> ${info.pinyin} — ${info.definition}</div>`
            : `<div class="word-def"><b>${c}</b> — ${t('error.no_dict')}</div>`;
        })
        .join('');
    }
    infoRadical.textContent = '';
  }

  // ---- Sizing ----
  function computeCanvasSize(selector) {
    const container = document.querySelector(selector || '.canvas-container');
    const width = container && container.clientWidth > 0 ? container.clientWidth : 400;
    return Math.min(Math.max(width - 20, 160), 300);
  }

  function computePracticeCanvasSize() {
    const container = document.querySelector('.practice-container');
    if (container && container.clientWidth > 0) {
      return Math.min(Math.max(container.clientWidth - 20, 160), 300);
    }
    const main = document.querySelector('.main-content');
    const width = main ? main.clientWidth : 400;
    return Math.min(Math.max(width - 40, 160), 280);
  }

  // ---- Animation tab ----
  function loadAnimationWriters() {
    animTarget.innerHTML = '';
    animWriters = [];

    const wrapper = document.createElement('div');
    wrapper.className = 'writer-row';
    animTarget.appendChild(wrapper);

    const size = computeCanvasSize();
    const perCanvas = currentChars.length > 1
      ? Math.min(size, Math.floor((size * 0.92) / Math.min(currentChars.length, 4)))
      : size;
    const pad = 6;

    currentChars.forEach((ch, i) => {
      const div = document.createElement('div');
      div.className = 'writer-cell';
      div.style.width = perCanvas + 'px';
      wrapper.appendChild(div);

      const speed = getSpeedParams();
      const writer = createGriddedWriter(div, ch, perCanvas, pad, Object.assign({
        strokeColor: '#4a6cf7',
        radicalColor: '#e74c3c',
        showCharacter: true,
        showOutline: true,
        onLoadCharDataError: () => {
          const err = document.createElement('div');
          err.style.cssText = 'position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:0.75rem;color:#e74c3c';
          err.textContent = t('error.no_data');
          div.appendChild(err);
        }
      }, speed));
      animWriters.push(writer);

      const label = document.createElement('div');
      label.className = 'writer-label';
      label.textContent = `${ch} · ${i + 1}`;
      div.appendChild(label);
    });

    updateStrokeCount();
  }

  function updateStrokeCount() {
    strokeCount.textContent = '…';
    const counts = currentChars.map((ch) =>
      HanziWriter.loadCharacterData(ch)
        .then((d) => d.strokes.length)
        .catch(() => null)
    );
    Promise.all(counts).then((nums) => {
      const valid = nums.filter((n) => n !== null);
      if (valid.length > 0) {
        strokeCount.textContent = valid.length > 1
          ? t('stroke.count_multi', { nums: valid.join(' + '), total: valid.reduce((a, b) => a + b, 0) })
          : t('stroke.count_single', { n: valid[0] });
      } else {
        strokeCount.textContent = '—';
      }
    });
  }

  // ---- Speed settings ----
  function getSpeedParams() {
    switch (animationSpeed) {
      case 'slow':  return { strokeAnimationSpeed: 0.8, delayBetweenStrokes: 300, chainDelay: 500 };
      case 'fast':  return { strokeAnimationSpeed: 2.5, delayBetweenStrokes: 80,  chainDelay: 200 };
      default:      return { strokeAnimationSpeed: 1.4, delayBetweenStrokes: 160, chainDelay: 350 };
    }
  }

  function setAnimationSpeed(speed) {
    animationSpeed = speed;
    speedBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.speed === speed);
    });
    if (currentChars.length) {
      stopLoop();
      isAnimating = false;
      loadAnimationWriters();
    }
  }

  // ---- Animation controls ----
  function playAnimation() {
    if (!animWriters.length) return;
    stopLoop();
    isAnimating = true;
    chainAnimate(0);
  }

  function chainAnimate(idx) {
    if (!isAnimating) { isAnimating = false; return; }
    if (idx >= animWriters.length) { isAnimating = false; return; }
    const params = getSpeedParams();
    animWriters[idx].animateCharacter({
      onComplete: function () {
        if (isAnimating) {
          setTimeout(() => chainAnimate(idx + 1), params.chainDelay);
        } else {
          isAnimating = false;
        }
      }
    });
  }

  function toggleLoop() {
    if (!animWriters.length) return;
    if (isAnimLooping) {
      stopLoop();
    } else {
      isAnimLooping = true;
      isAnimating = true;
      loopBtn.innerHTML = t('animation.stop');
      loopChain(0);
    }
  }

  function loopChain(idx) {
    if (!isAnimLooping) return;
    const params = getSpeedParams();
    animWriters[idx].animateCharacter({
      onComplete: function () {
        if (!isAnimLooping) return;
        setTimeout(() => loopChain((idx + 1) % animWriters.length), params.chainDelay + 50);
      }
    });
  }

  function stopLoop() {
    isAnimLooping = false;
    loopBtn.innerHTML = t('animation.loop');
  }

  function resetAnimationButtons() {
    isAnimLooping = false;
    isAnimating = false;
    loopBtn.innerHTML = t('animation.loop');
  }

  // ---- Outline persistence ----
  function loadOutlinePreference() {
    const saved = localStorage.getItem('hanzi-outline');
    outlineVisible = saved !== 'false';
  }
  function saveOutlinePreference() {
    localStorage.setItem('hanzi-outline', outlineVisible ? 'true' : 'false');
  }

  // ---- Practice tab ----
  function setupPractice() {
    practiceTarget.innerHTML = '';
    quizWriters = {};
    practicePos = 0;
    loadOutlinePreference();
    practiceSize = Math.min(computePracticeCanvasSize() + 20, 320);
    updatePracticeChrome();
    loadPracticeChar();
  }

  function loadPracticeChar() {
    const ch = currentChars[practicePos];
    if (!ch) return;

    const size = practiceSize || Math.min(computePracticeCanvasSize() + 20, 320);
    const pad = 8;

    practiceTarget.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'practice-writer-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.width = size + 'px';
    wrapper.style.height = size + 'px';
    wrapper.style.margin = '0 auto';
    practiceTarget.appendChild(wrapper);

    const gridSvg = createGridSvg(size, size, pad);
    gridSvg.style.position = 'absolute';
    gridSvg.style.top = '0';
    gridSvg.style.left = '0';
    gridSvg.style.pointerEvents = 'none';
    wrapper.appendChild(gridSvg);

    const hwDiv = document.createElement('div');
    hwDiv.style.width = size + 'px';
    hwDiv.style.height = size + 'px';
    wrapper.appendChild(hwDiv);

    const writer = HanziWriter.create(hwDiv, ch, {
      width: size,
      height: size,
      padding: pad,
      strokeColor: isDarkTheme() ? '#999' : '#555',
      radicalColor: '#e74c3c',
      outlineColor: isDarkTheme() ? '#666' : '#ccc',
      drawingColor: drawingColor(),
      drawingWidth: 5,
      showCharacter: false,
      showOutline: outlineVisible,
      showHintAfterMisses: 3,
      highlightOnComplete: true,
      renderer: 'svg'
    });
    quizWriters[ch] = writer;
    outlineToggleBtn.innerHTML = outlineVisible ? t('outline.hide') : t('outline.show');
    if (!outlineVisible) {
      writer.hideOutline({ duration: 0 });
    }
    startQuizOnWriter(writer, ch);
  }

  function startQuizOnWriter(writer, ch) {
    if (!writer) return;
    writer.cancelQuiz();
    writer.hideCharacter({ duration: 0 });
    if (outlineVisible) {
      writer.showOutline({ duration: 0 });
    } else {
      writer.hideOutline({ duration: 0 });
    }
    currentNextStroke = 0;
    quizStatus.textContent = t('practice.draw_strokes', { char: ch });
    quizProgress.textContent = '';
    quizActive = true;
    writer.quiz({
      onComplete: function (data) {
        quizStatus.textContent = t('practice.complete', { char: ch });
        quizProgress.textContent = data.totalMistakes === 0 ? t('practice.perfect') : t('practice.mistakes', { n: data.totalMistakes });
        quizActive = false;
      },
      onCorrectStroke: function (data) {
        currentNextStroke = data.strokeNum + 1;
        quizProgress.textContent = t('practice.stroke_correct', { num: data.strokeNum + 1, remaining: data.strokesRemaining });
      },
      onMistake: function (data) {
        quizProgress.textContent = t('practice.stroke_mistake', { num: data.strokeNum + 1, mistakes: data.mistakesOnStroke });
      }
    });
  }

  function toggleOutline() {
    const writer = getQuizWriter();
    if (!writer) return;
    if (outlineVisible) {
      writer.hideOutline({ duration: 200 });
      outlineVisible = false;
      saveOutlinePreference();
      outlineToggleBtn.innerHTML = t('outline.show');
      quizStatus.textContent = t('practice.draw_no_outline');
    } else {
      writer.showOutline({ duration: 200 });
      outlineVisible = true;
      saveOutlinePreference();
      outlineToggleBtn.innerHTML = t('outline.hide');
      quizStatus.textContent = t('practice.draw');
    }
  }

  function resetPractice() {
    const ch = currentChars[practicePos];
    if (!ch) return;
    loadPracticeChar();
  }

  function updatePracticeChrome() {
    const nav = $('#charNavigator');
    if (currentChars.length <= 1) {
      charCounter.textContent = '';
      nav.classList.add('hidden');
    } else {
      charCounter.textContent = `${currentChars[practicePos]}  (${practicePos + 1} / ${currentChars.length})`;
      nav.classList.remove('hidden');
      prevCharBtn.disabled = practicePos === 0;
      nextCharBtn.disabled = practicePos === currentChars.length - 1;
    }
  }

  function prevChar() {
    if (practicePos > 0) {
      practicePos--;
      loadPracticeChar();
      updatePracticeChrome();
    }
  }
  function nextChar() {
    if (practicePos < currentChars.length - 1) {
      practicePos++;
      loadPracticeChar();
      updatePracticeChrome();
    }
  }

  function getQuizWriter() {
    return quizWriters[currentChars[practicePos]] || null;
  }

  function showHint() {
    const writer = getQuizWriter();
    if (!writer || !quizActive) return;

    const strokeNum = currentNextStroke;

    HanziWriter.loadCharacterData(currentChars[practicePos]).then((data) => {
      if (strokeNum < data.strokes.length) {
        writer.highlightStroke(strokeNum);
        quizStatus.textContent = t('hint.highlighted', { num: strokeNum + 1, total: data.strokes.length });
      } else {
        quizStatus.textContent = t('hint.done');
      }
    }).catch(() => {
      writer.highlightStroke(0);
      quizStatus.textContent = t('hint.first');
    });
  }

  function resetQuizState(updateChrome) {
    quizActive = false;
    quizStatus.textContent = t('practice.draw');
    quizProgress.textContent = '';
    if (updateChrome !== false) updatePracticeChrome();
  }

  // ---- History ----
  function addToHistory(query) {
    history = history.filter((q) => q !== query);
    history.unshift(query);
    if (history.length > 10) history.pop();
    renderHistory();
  }

  function renderHistory() {
    if (history.length === 0) {
      historyBar.classList.add('hidden');
      return;
    }
    historyBar.classList.remove('hidden');
    historyChips.innerHTML = history
      .map((q) => `<button data-char="${q}">${q}</button>`)
      .join('');
    historyChips.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.char;
        searchCharacter(btn.dataset.char);
      });
    });
  }

  // ---- Random ----
  function randomCharacter() {
    const keys = Object.keys(HANZI_DICT).filter((k) => k.length === 1);
    if (keys.length === 0) return;
    const randomChar = keys[Math.floor(Math.random() * keys.length)];
    input.value = randomChar;
    searchCharacter(randomChar);
  }

  // ---- Tabs ----
  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).classList.add('active');
    if (tabId === 'practice' && currentChars.length) {
      const writer = getQuizWriter();
      const ch = currentChars[practicePos];
      if (writer && !quizActive) {
        startQuizOnWriter(writer, ch);
      }
    }
  }

  // ---- Events ----
  function bindEvents() {
    searchBtn.addEventListener('click', () => {
      autoList.classList.add('hidden');
      searchCharacter(input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        autoList.classList.add('hidden');
        searchCharacter(input.value);
      }
    });
    input.addEventListener('input', showAutocomplete);
    input.addEventListener('blur', () => {
      setTimeout(() => autoList.classList.add('hidden'), 200);
    });
    input.addEventListener('focus', () => {
      if (input.value.length >= 2) showAutocomplete();
    });

    autoList.addEventListener('click', (e) => {
      const btn = e.target.closest('.auto-item');
      if (btn) {
        selectAuto(btn.dataset.char);
      }
    });

    randomBtn.addEventListener('click', randomCharacter);
    themeToggle.addEventListener('click', toggleTheme);

    document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    playBtn.addEventListener('click', playAnimation);
    loopBtn.addEventListener('click', toggleLoop);
    speedBtns.forEach((btn) => btn.addEventListener('click', () => setAnimationSpeed(btn.dataset.speed)));

    outlineToggleBtn.addEventListener('click', toggleOutline);
    resetQuizBtn.addEventListener('click', resetPractice);
    showHintBtn.addEventListener('click', showHint);
    prevCharBtn.addEventListener('click', prevChar);
    nextCharBtn.addEventListener('click', nextChar);

    // Language switch
    langBtns.forEach((btn) => btn.addEventListener('click', () => {
      switchLanguage(btn.dataset.lang);
      onLangChange();
    }));
    // Listen for langchange event from i18n.js (in case it's triggered programmatically)
    document.addEventListener('langchange', onLangChange);

    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (currentChars.length) {
          loadAnimationWriters();
          setupPractice();
          resetAnimationButtons();
        }
      }, 200);
    });
  }

  // ---- Responsive ----
  let resizeTimer = null;

  // ---- Entry ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();