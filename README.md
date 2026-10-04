# Practice Hanzi вЂ” Chinese Character Learning PWA

A cross-platform Progressive Web App for studying Chinese characters (hГ nzГ¬). Search any character, watch its stroke order animation, see pinyin + meaning, then practice writing it on screen with real-time stroke-order grading.

![Practice Hanzi](icons/icon-192.png)

## Features

- рџ”Ќ **Search** вЂ” type a Chinese character, a word, English meaning, or pinyin (plain or tone-marked: `hao`, `hЗЋo`)
- рџ“– **Info card** вЂ” big character, pinyin with tone marks, and English definition
- в–¶пёЏ **Stroke order animation** вЂ” smooth per-stroke drawing with the correct stroke sequence (SVG)
- вњЌпёЏ **Handwriting practice** вЂ” draw directly on screen (touch, mouse, or stylus); Hanzi Writer grades each stroke for correctness *and* order, gives hints after repeated mistakes, and reports mistakes per stroke
- рџ”Ѓ **Loop & pause** вЂ” replay animations or pause mid-draw
- рџ“љ **Multi-character words** вЂ” search дё­е›Ѕ, дЅ еҐЅ, etc. and practice character-by-character with prev/next navigation
- рџЊ™ **Dark/light theme** вЂ” persisted in localStorage
- рџЋІ **Random character** вЂ” discover new characters
- рџ•“ **Recent history** вЂ” quick re-open of previous lookups (persisted in URL hash, shareable)
- рџ“ґ **Offline PWA** вЂ” installable, works offline via service worker

## Tech Stack

| Piece | Technology |
|---|---|
| Rendering | HTML5 + CSS + vanilla JS (no build step) |
| Stroke data & animation | [Hanzi Writer 3.5](https://hanziwriter.org) (MIT, 9 kB gzipped) |
| Stroke data source | [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) (9000+ chars) |
| Pinyin/definitions | Embedded dictionary (`dictionary.js`, 600+ entries, HSK 1вЂ“2 core) |
| Offline/installability | Service Worker + Web App Manifest |

## Run Locally

Because Hanzi Writer loads character data via fetch, serve the folder over HTTP (not `file://`).

**Option A вЂ” Node built-in server (no dependencies):**

```bash
node server.js        # serves at http://127.0.0.1:8090
```

**Option B вЂ” any static server:**

```bash
python3 -m http.server 8090
# or
npx http-server . -p 8090
```

Then open **http://127.0.0.1:8090** (or your phone on the same LAN for touch testing).

To test the PWA install prompt, open Chrome в†’ DevTools в†’ Application в†’ Manifest в†’ "Installability" or use the address-bar install icon.

## Project Structure

```
chinese-writer/
в”њв”Ђв”Ђ index.html        # app shell (search, info card, tabs, canvases)
в”њв”Ђв”Ђ app.css           # responsive styling, light/dark themes
в”њв”Ђв”Ђ app.js            # app logic (search, animation chaining, quiz wiring)
в”њв”Ђв”Ђ dictionary.js     # embedded pinyin/definition data + lookup helper
в”њв”Ђв”Ђ sw.js             # service worker (offline caching)
в”њв”Ђв”Ђ manifest.json     # PWA manifest
в”њв”Ђв”Ђ server.js         # tiny zero-dependency static server for local dev
в”њв”Ђв”Ђ icons/            # generated app icons (192/512)
в”њв”Ђв”Ђ test-dict.js      # dictionary unit test
в””в”Ђв”Ђ test-smoke.js     # mock-DOM smoke test (13 scenarios)
```

## Extending the Dictionary

`dictionary.js` defines a simple map:

```js
const HANZI_DICT = {
  'е­—': ['zГ¬', 'character / word / script'],
  ...
};
```

- Add `'ж–°е­—': ['pД«n yД«n', 'definition']` for single chars or full words.
- The lookup helper `lookupHanzi(query)` supports Chinese chars, English substrings (`love` в†’ з€±), and pinyin (with or without tone marks).
- For a complete dictionary, consider swapping in [cc-cedict](https://cc-cedict.org) (parsed), [HanziDB](https://hanzidb.org), or the `all.json` from `hanzi-writer-data`.

Character stroke data is *not* bundled вЂ” it's fetched per-character from the jsDelivr CDN (`hanzi-writer-data`) on first use and cached by the service worker, so successful lookups work offline afterward.

## Tests

```bash
node test-dict.js     # dictionary lookup unit tests (7 assertions)
node test-smoke.js    # mock-DOM smoke test (13 scenarios: search, tabs, quiz, theme, nav)
```

## Roadmap Ideas

- Expand dictionary to full HSK / CC-CEDICT coverage
- Radical + decomposition breakdown (`hanzi-writer-data` includes radical info)
- Audio pronunciation (e.g. Google Translate TTS endpoint)
- Spaced-repetition review (IndexedDB)
- SVG stroke export / save practice attempts
- Wrap in Capacitor/Tauri for store distribution

## License

- Hanzi Writer: [MIT](https://github.com/chanind/hanzi-writer/blob/master/LICENSE.txt)
- Make Me a Hanzi data: [custom permissive license](https://github.com/skishore/makemeahanzi) (free for all uses, incl. commercial)
- This app code: MIT