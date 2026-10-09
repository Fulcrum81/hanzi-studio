// Compare HANZI_DICT (dictionary.js) against RU_DICT (i18n.js)
// Reports which glyphs have English but no Russian definition.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeElement(id, tag) {
  return {
    id: id || '',
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    classList: {
      _set: new Set(),
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
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k] || null; },
    _listeners: {},
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    dispatch(ev) { (this._listeners[ev] || []).forEach((fn) => fn({ target: this })); },
  };
}

const documentMock = {
  readyState: 'complete',
  documentElement: makeElement('html'),
  querySelector() { return makeElement(); },
  querySelectorAll() { return []; },
  createElement(tag) { return makeElement(null, tag); },
  createElementNS() { return makeElement(null, 'svg'); },
  addEventListener() {},
  getElementById() { return makeElement(); },
};

const windowMock = {
  addEventListener() {},
  CustomEvent: function () {},
  navigator: { serviceWorker: { register: () => Promise.resolve() } },
};

const sandbox = {
  document: documentMock,
  window: windowMock,
  location: { hash: '' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  navigator: windowMock.navigator,
  console,
  setTimeout,
  clearTimeout,
  decodeURIComponent,
  encodeURIComponent,
};
sandbox.window = windowMock;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(__dirname, 'dictionary.js'), 'utf8'), sandbox, { filename: 'dictionary.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'i18n.js'), 'utf8'), sandbox, { filename: 'i18n.js' });

// const bindings in a vm context can't be read as globals — extract via expression
const { HANZI_DICT, RU_DICT } = vm.runInContext('({HANZI_DICT, RU_DICT})', sandbox);
const H = HANZI_DICT;
const R = RU_DICT;

console.log('HANZI_DICT entries:', Object.keys(H).length);
console.log('RU_DICT entries:', Object.keys(R).length);

const missing = Object.keys(H).filter((k) => !R[k]);
console.log('\nGlyphs in HANZI_DICT missing from RU_DICT:', missing.length);
for (const ch of missing) {
  console.log(ch + '\t' + H[ch][0] + '\t' + H[ch][1]);
}

const wrongPinyin = Object.keys(R).filter((k) => R[k] && H[k] && R[k][0] !== H[k][0]);
console.log('\nRU_DICT entries whose pinyin differs from HANZI_DICT:', wrongPinyin.length);
for (const ch of wrongPinyin) {
  console.log(ch + '\tEN: ' + H[ch][0] + '\tRU: ' + R[ch][0]);
}