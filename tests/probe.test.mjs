import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/probe.js';
const { createProbe } = globalThis.SubtitleProbe;

// A page: elements with children, text nodes, and textContent as a browser computes it.
function element(...children) {
  const node = { nodeType: 1, childNodes: [], parentNode: null, isConnected: true,
    get textContent() { return this.childNodes.map(c => c.nodeType === 3 ? c.nodeValue : c.textContent).join(''); },
    set(...next) { this.childNodes = next.map(c => typeof c === 'string' ? { nodeType: 3, nodeValue: c, parentNode: this } : Object.assign(c, { parentNode: this })); return this; } };
  return node.set(...children);
}
const cues = [{ start: 5.007, end: 6.34, text: 'I find it incumbent\nthat you see' }, { start: 6.373, end: 8.273, text: 'the inside of\na prison cell.' }, { start: 12, end: 13.5, text: 'Because he’s my brother.' }];

test('the player\'s own captions are found by their text and timed against the file', () => {
  // The player draws each line of a subtitle in its own element and replaces them per subtitle.
  const region = element(), body = element(element('Some menu'), element(element(region)));
  const probe = createProbe({ root: () => body });
  const show = text => region.set(...(text ? text.split('\n').map(line => element(line)) : []));
  let now = 0;
  const at = time => probe.sample(time, cues, now += 600);
  at(4); assert.deepEqual(probe.summary(), { measured: 0, searches: 0, found: false }, 'nothing is searched for between subtitles');
  // The player shows the first line 0.05 s after the file's time and keeps it 0.3 s too long.
  at(5.02); assert.equal(probe.summary().found, false, 'its captions are off or not drawn yet');
  show(cues[0].text); at(5.057); assert.equal(probe.summary().found, true);
  // Found only now, so this line's appearance was not seen; measuring starts with the next change.
  show(cues[1].text); at(6.64);
  show(''); at(8.5);
  show(cues[2].text); at(12.1);
  show(''); at(13.9);
  const result = probe.summary();
  assert.equal(result.measured, 3);
  assert.deepEqual(result.last[1], [0.267, 0.227, 3.727], 'second line: appeared 0.267 s late, stayed 0.227 s after its end, then a pause');
  assert.deepEqual(result.last[2], [0.1, 0.4, null]);
  assert.equal(result.beforeAnotherLine.lines, 1); assert.equal(result.beforeAPause.lines, 2);
  assert.equal(result.beforeAPause.disappears, 0.227);
});

test('other text on the page is not taken for captions, and a removed caption region is found again', () => {
  const region = element(), holder = element(region), body = element(element('I find it'), holder);
  const probe = createProbe({ root: () => body, limit: 2 });
  let now = 0; const at = time => probe.sample(time, cues, now += 600);
  at(5.1); assert.equal(probe.summary().found, false, 'a part of the line elsewhere on the page is not the caption');
  region.set(element('I find it incumbent'), element('that you see')); at(5.2); assert.equal(probe.summary().found, true);
  region.isConnected = false; holder.isConnected = false;
  const again = element(element('the inside of'), element('a prison cell.')); body.set(element('I find it'), element(again));
  at(6.4); at(6.5); assert.equal(probe.summary().found, true, 'the player replaced its caption element');
  again.set(); at(8.4); again.set(element('Because he’s my brother.')); at(12.05); again.set(); at(13.6); again.set(element('x')); at(14);
  assert.equal(probe.summary().measured, 2, 'it stops at its limit');
});
