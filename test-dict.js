// Quick test of dictionary.js lookup logic
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'dictionary.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const { HANZI_DICT, lookupHanzi, autocompletePinyin, PINYIN_INDEX } = vm.runInContext('({HANZI_DICT, lookupHanzi, autocompletePinyin, PINYIN_INDEX})', sandbox);

const tests = [
  { q: '好', expect: 'hǎo' },
  { q: '你', expect: 'nǐ' },
  { q: '中国', expect: 'zhōng guó' },
  { q: '水', expect: 'shuǐ' },
  { q: 'love', expect: 'ài' },
  { q: 'friend', expect: 'péng' },
  { q: '美国', expect: 'měi guó' },
  { q: 'kǎo', expect: 'kǎo' },
  { q: 'word', expect: 'zì' },
];

console.log('Total dictionary entries:', Object.keys(HANZI_DICT).length);

let pass = 0, fail = 0;
for (const t of tests) {
  const result = lookupHanzi(t.q);
  const ok = result && result.pinyin === t.expect;
  if (ok) {
    pass++;
    console.log(`PASS: "${t.q}" -> ${result.char} [${result.pinyin}] ${result.definition}`);
  } else {
    fail++;
    console.log(`FAIL: "${t.q}" -> ${JSON.stringify(result)}`);
  }
}

// Check single-char count for random button
const singleKeys = Object.keys(HANZI_DICT).filter((k) => k.length === 1);
console.log('Single-char entries:', singleKeys.length);

console.log('Single-char entries:', singleKeys.length);

// ---- Test pinyin autocomplete ----
console.log('\n--- Pinyin autocomplete tests ---');
const autoTests = [
  { prefix: 'hao', min: 1 },
  { prefix: 'ni', min: 1 },
  { prefix: 'zhong', min: 1 },
  { prefix: 'da', min: 1 },
  { prefix: 'xxnotexist', min: 0 },
  { prefix: 'v', min: 0 }, // accepted but no specific 'v' prefix chars
  { prefix: 'nv', min: 1 }, // 女 nǚ
  { prefix: 'sh', min: 2 },
];

for (const t of autoTests) {
  const results = autocompletePinyin(t.prefix);
  const ok = results.length >= t.min;
  if (ok) {
    pass++;
    console.log(`PASS: "${t.prefix}" -> ${results.length} results: ${results.map(r => r.char + '[' + r.pinyin + ']').join(', ')}`);
  } else {
    fail++;
    console.log(`FAIL: "${t.prefix}" -> expected >=${t.min}, got ${results.length}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);