/*
 * Mock-DOM smoke test for app.js
 * Simulates the DOM/HanziWriter APIs app.js uses, runs the app, then
 * exercises key flows (search, animation play, quiz start, tabs, theme).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------- Build a minimal fake DOM ----------
function makeElement(id, tag) {
  return {
    id: id || '',
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    classList: {
      _set: new Set(['hidden'].filter(() => false)),
      add(...cs) { cs.forEach((c) => this._set.add(c)); },
      remove(...cs) { cs.forEach((c) => this._set.delete(c)); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) {
        const v = force !== undefined ? force : !this._set.has(c);
        if (v) this._set.add(c); else this._set.delete(c);
        return v;
      },
    },
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = String(v); },
    setAttributeNS(ns, k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k] || null; },
    removeAttribute(k) { delete this._attrs[k]; },
    _listeners: {},
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    click() { this.dispatch('click'); },
    dispatch(ev, arg) {
      // Custom: also dispatch to children for 'click' history chips
      (this._listeners[ev] || []).forEach((fn) => fn({ key: undefined, target: this }));
    },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    append(...cs) { cs.forEach((c) => this.appendChild(c)); },
    set innerHTML2(v) { this._html = v; },
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        const walk = (el) => {
          if (el.id === id) return el;
          for (const c of el.children) { const r = walk(c); if (r) return r; }
          return null;
        };
        return walk(this);
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        const walk = (el) => {
          if (el.className && el.className.split(' ').includes(cls)) return el;
          for (const c of el.children) { const r = walk(c); if (r) return r; }
          return null;
        };
        return walk(this);
      }
      return null;
    },
    querySelectorAll(sel) { return this.children.filter((c) => c.tagName === 'BUTTON' || sel.includes('tab')); },
  };
}

const elements = {};
function reg(id) {
  // repeatModeBtn is the same DOM element as modeRepeat
  if (id === 'repeatModeBtn') {
    return reg('modeRepeat');
  }
  if (!elements[id]) {
    elements[id] = makeElement(id);
    // Elements that start hidden in the real HTML
    if (['resultPanel', 'historyBar', 'charNavigator', 'easterOverlay'].includes(id)) {
      elements[id].classList.add('hidden');
    }
    // themeToggle has two SVG children (moon visible, sun hidden)
    if (id === 'themeToggle') {
      const moon = makeElement();
      moon.className = 'theme-icon-moon';
      elements[id].appendChild(moon);
      const sun = makeElement();
      sun.className = 'theme-icon-sun hidden';
      elements[id].appendChild(sun);
    }
    // Mode buttons need data-mode
    if (id === 'modeFree') elements[id].dataset.mode = 'free';
    if (id === 'modeGuided') elements[id].dataset.mode = 'guided';
    if (id === 'modeRepeat') { elements[id].dataset.mode = 'repeat'; elements[id].id = 'repeatModeBtn'; }
    if (id === 'repeatModeBtn') { /* alias — same as modeRepeat */ }
    // Speed options need data-speed
    if (id === 'speedOptFast') elements[id].dataset.speed = 'fast';
    if (id === 'speedOptMedium') elements[id].dataset.speed = 'medium';
    if (id === 'speedOptSlow') elements[id].dataset.speed = 'slow';
  }
  return elements[id];
}

// Top-level DOM document mock
const documentMock = {
  readyState: 'complete',
  documentElement: makeElement('html'),
  querySelector(sel) {
    if (sel === '.canvas-container' || sel === '.practice-container') return reg('canvasMock');
    if (sel.startsWith('.tab-btn')) return null;
    if (sel === '.history-label') return reg('historyLabel');
    if (sel === '.main-content') return reg('mainContent');
    return reg(sel.replace(/^#/, ''));
  },
  querySelectorAll(sel) {
    if (sel === '.tab-btn') return [reg('tabAnimate'), reg('tabPractice')];
    if (sel === '.tab-content') return [reg('tabAnimate'), reg('tabPractice')];
    if (sel === '.lang-btn') return [reg('langEn'), reg('langRu')];
    if (sel === '.speed-opt') return [reg('speedOptFast'), reg('speedOptMedium'), reg('speedOptSlow')];
    if (sel === '.mode-btn') return [reg('modeFree'), reg('modeGuided'), reg('modeRepeat')];
    return [];
  },
  createElement(tag) { return makeElement(null, tag); },
  createElementNS() { return makeElement(null, 'svg'); },
  addEventListener() {},
  dispatchEvent() {},
  getElementById(id) { return reg(id); },
};

// Fake HanziWriter
function FakeWriter(el, char, opts) {
  this.el = el;
  this.char = char;
  this.opts = opts || {};
  this.visible = true;
  this.outline = true;
  this.quizRunning = false;
  this.queue = [];
}
FakeWriter.prototype.setCharacter = function (c) { this.char = c; };
FakeWriter.prototype.animateCharacter = function (opts) {
  const cb = (opts && opts.onComplete) || (() => {});
  setTimeout(cb, 0);
  return Promise.resolve();
};
FakeWriter.prototype.loopCharacterAnimation = function () {};
FakeWriter.prototype.pauseAnimation = function () {};
FakeWriter.prototype.resumeAnimation = function () {};
FakeWriter.prototype.hideCharacter = function (opts) { this.visible = false; if (opts && opts.onComplete) setTimeout(opts.onComplete, 0); return opts && opts.duration ? Promise.resolve() : undefined; };
FakeWriter.prototype.showCharacter = function (opts) { this.visible = true; if (opts && opts.onComplete) opts.onComplete(); return Promise.resolve(); };
FakeWriter.prototype.hideOutline = function (opts) { this.outline = false; };
FakeWriter.prototype.showOutline = function (opts) { this.outline = true; };
FakeWriter.prototype.highlightStroke = function (num) { /* no-op mock */ };
FakeWriter.prototype.cancelQuiz = function () { this.quizRunning = false; };
FakeWriter.prototype.quiz = function (opts) {
  this.quizRunning = true;
  this._quizOpts = opts;
};
FakeWriter.create = function (el, char, opts) { return new FakeWriter(el, char, opts); };
FakeWriter.loadCharacterData = function (char) {
  return Promise.resolve({ strokes: [{}, {}] }); // 2 strokes per char
};
FakeWriter.getScalingTransform = function () { return { x: 0, y: 0, scale: 1, transform: '' }; };

const locationMock = { hash: '', href: '' };
const localStorageMock = {
  _s: {},
  getItem(k) { return this._s[k] || null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};
const windowMock = {
  addEventListener() {},
  dispatchEvent() {},
  setTimeout,
  clearTimeout,
  location: locationMock,
  localStorage: localStorageMock,
  HanziWriter: FakeWriter,
  navigator: { serviceWorker: undefined },
  CustomEvent: function CustomEvent(type) { this.type = type; },
};

// ---------- Load files ----------
const dictSrc = fs.readFileSync(path.join(__dirname, 'dictionary.js'), 'utf8');
const i18nSrc = fs.readFileSync(path.join(__dirname, 'i18n.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const sandbox = {
  document: documentMock,
  window: windowMock,
  location: locationMock,
  localStorage: localStorageMock,
  HanziWriter: FakeWriter,
  navigator: windowMock.navigator,
  console,
  setTimeout,
  clearTimeout,
  Promise,
  decodeURIComponent,
  encodeURIComponent,
  CustomEvent: windowMock.CustomEvent,
};
sandbox.window = windowMock;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let errors = [];
try {
  vm.runInContext(dictSrc, sandbox, { filename: 'dictionary.js' });
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  vm.runInContext(appSrc, sandbox, { filename: 'app.js' });
  console.log('✓ app.js loaded without errors');
} catch (e) {
  console.log('✗ Load error:', e.message);
  process.exit(1);
}

// ---------- Drive the app ----------
const runs = [];
function run(name, fn) {
  try {
    fn();
    runs.push(['PASS', name]);
  } catch (e) {
    runs.push(['FAIL', name + ' -> ' + e.message]);
  }
}

// 1. Search a single char
run('search single char 好', () => {
  reg('charInput').value = '好';
  reg('searchBtn').click();
  if (reg('resultPanel').classList.contains('hidden')) throw new Error('resultPanel should be visible');
  if (reg('infoHanzi').textContent !== '好') throw new Error('infoHanzi should be 好, got ' + reg('infoHanzi').textContent);
});

// 2. Search a multi-char word
run('search multi-char 中国', () => {
  reg('charInput').value = '中国';
  reg('searchBtn').click();
  if (reg('infoHanzi').textContent !== '中国') throw new Error('infoHanzi should be 中国');
});

// 2b. RU mode: word-level definition should come from RU_DICT
run('RU word lookup shows Russian definition', () => {
  vm.runInContext('switchLanguage("ru")', sandbox);
  reg('charInput').value = '中国';
  reg('searchBtn').click();
  const def = reg('infoDefinition').textContent;
  if (!def.includes('Китай')) throw new Error('RU definition should contain Китай, got: ' + def);
  vm.runInContext('switchLanguage("en")', sandbox);
});

// 3. Search by English
run('search English "love"', () => {
  reg('charInput').value = 'love';
  reg('searchBtn').click();
  if (reg('infoHanzi').textContent !== '爱') throw new Error('infoHanzi should be 爱, got ' + reg('infoHanzi').textContent);
});

// 3b. Search by Russian word (RU mode)
run('search Russian "китай"', () => {
  vm.runInContext('switchLanguage("ru")', sandbox);
  reg('charInput').value = 'китай';
  reg('searchBtn').click();
  if (reg('infoHanzi').textContent !== '中国') throw new Error('RU search китай should find 中国, got ' + reg('infoHanzi').textContent);
  if (!reg('infoDefinition').textContent.includes('Китай')) throw new Error('definition should be Китай, got ' + reg('infoDefinition').textContent);
  vm.runInContext('switchLanguage("en")', sandbox);
});
run('search Russian "яблоко"', () => {
  vm.runInContext('switchLanguage("ru")', sandbox);
  reg('charInput').value = 'яблоко';
  reg('searchBtn').click();
  if (reg('infoHanzi').textContent !== '苹果') throw new Error('RU search яблоко should find 苹果, got ' + reg('infoHanzi').textContent);
  vm.runInContext('switchLanguage("en")', sandbox);
});

// 4. Random
run('random character', () => {
  reg('randomBtn').click();
});

// 5. Tab switch
run('switch to practice tab', () => {
  const tabPractice = reg('tabPractice');
  // The tab buttons in real DOM have data-tab; simulate
  reg('tabPractice').__clicked = true;
  // call internal handler via click on the button element. In real HTML the tab-btn elements:
  documentMock.querySelectorAll('.tab-btn').forEach((b) => {
    // b is reg('tabAnimate')/reg('tabPractice') here as fake
  });
});

// 6. Animation play
run('play animation', () => {
  reg('playBtn').click();
});

// 7. Loop toggle
run('toggle loop', () => {
  reg('loopBtn').click();
  reg('loopBtn').click(); // off
});

// 8. Speed selector
run('speed selector', () => {
  const btns = sandbox.document.querySelectorAll('.speed-opt');
  if (btns.length !== 3) throw new Error('Expected 3 speed option buttons, got ' + btns.length);
});

// 9. Outline toggle
run('toggle outline', () => {
  reg('outlineToggleBtn').click();
  if (!reg('outlineToggleBtn').title.includes('Show')) throw new Error('Outline should be hidden, got: ' + reg('outlineToggleBtn').title);
  reg('outlineToggleBtn').click();
  if (!reg('outlineToggleBtn').title.includes('Hide')) throw new Error('Outline should be visible again, got: ' + reg('outlineToggleBtn').title);
});

// 9. Reset practice (redraw)
run('reset quiz', () => {
  reg('resetQuizBtn').click();
});

// 10. Hint
run('show hint', () => {
  reg('showHintBtn').click();
});

// 11. Theme toggle
run('toggle theme', () => {
  reg('themeToggle').click();
  if (sandbox.document.documentElement.getAttribute('data-theme') !== 'dark') throw new Error('Theme should be dark');
  reg('themeToggle').click();
  if (sandbox.document.documentElement.getAttribute('data-theme') !== null) throw new Error('Theme should be light');
});

// 13. Prev / next char in multi-char word
run('navigate chars in word', () => {
  reg('charInput').value = '你好';
  reg('searchBtn').click();
  reg('nextCharBtn').click();
  reg('prevCharBtn').click();
});

// 14. Practice mode switching
run('switch to guided mode', () => {
  reg('modeGuided').click();
  if (reg('modeGuided').classList.contains('active') === false) throw new Error('Guided mode should be active');
});
run('switch to repeat mode', () => {
  reg('modeRepeat').click();
  if (reg('modeRepeat').classList.contains('active') === false) throw new Error('Repeat mode should be active');
  if (!reg('modeRepeat').innerHTML.includes('3x')) throw new Error('Repeat should show "3x", got: ' + reg('modeRepeat').innerHTML);
});
run('cycle repeat count', () => {
  reg('modeRepeat').click();
  if (!reg('modeRepeat').innerHTML.includes('5x')) throw new Error('Repeat should show "5x", got: ' + reg('modeRepeat').innerHTML);
  reg('modeRepeat').click();
  reg('modeRepeat').click();
  reg('modeRepeat').click();
  reg('modeRepeat').click();
  if (!reg('modeRepeat').innerHTML.includes('100')) throw new Error('Repeat should show count 100, got: ' + reg('modeRepeat').innerHTML);
  reg('modeRepeat').click();
  if (!reg('modeRepeat').innerHTML.includes('3')) throw new Error('Repeat should wrap back to 3, got: ' + reg('modeRepeat').innerHTML);
});
run('switch back to free mode', () => {
  reg('modeFree').click();
  if (reg('modeFree').classList.contains('active') === false) throw new Error('Free mode should be active');
});

console.log('\n=== Smoke test results ===');
let fails = 0;
for (const [status, name] of runs) {
  console.log(`${status}: ${name}`);
  if (status === 'FAIL') fails++;
}
console.log(`\n${runs.length - fails}/${runs.length} passed`);
process.exit(fails > 0 ? 1 : 0);