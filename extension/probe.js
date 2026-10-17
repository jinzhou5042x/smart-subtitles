// A measurement, not a feature: when the player's own captions show and hide each line, compared
// with the times in the subtitle file. It answers "are we earlier or later than the player" with
// numbers from the page instead of an impression, on any service, without knowing its markup:
// the player's caption is found as the element whose text is the line the file says is on screen.
// It only reads, only while the viewer has the player's captions turned on, and stops after
// `limit` lines. The result is part of "Copy diagnostics"; nothing is drawn from it.
(function (scope) {
  const squeeze = text => String(text ?? '').replace(/\s+/g, '').toLowerCase();
  function* textNodes(node) {
    for (const child of Array.from(node.childNodes || [])) {
      if (child.nodeType === 3) { if (squeeze(child.nodeValue)) yield child; }
      else if (child.nodeType === 1) { yield* textNodes(child); if (child.shadowRoot) yield* textNodes(child.shadowRoot); }
    }
  }
  const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };
  const round = value => value === null ? null : Math.round(value * 1000) / 1000;
  function createProbe({ root = () => document.body, limit = 60 } = {}) {
    let region = null, searched = -Infinity, shown = null, searches = 0;
    const lines = [];
    // The largest element whose whole text is this line: the caption region, which outlives a line.
    function find(wanted) {
      for (const node of textNodes(root())) {
        if (!wanted.includes(squeeze(node.nodeValue))) continue;
        let element = node.parentNode;
        while (element && squeeze(element.textContent) !== wanted && wanted.includes(squeeze(element.textContent))) element = element.parentNode;
        if (!element || squeeze(element.textContent) !== wanted) continue;
        while (element.parentNode && element.parentNode.nodeType === 1 && squeeze(element.parentNode.textContent) === wanted) element = element.parentNode;
        return element;
      }
      return null;
    }
    return {
      // Every frame: the subtitle time, all cues of the file, and the wall clock.
      sample(time, cues, now = Date.now()) {
        if (lines.length >= limit || !cues.length) return;
        if (region && region.isConnected === false) region = null;
        if (!region) {
          const current = cues.find(c => c.start <= time && time < c.end);
          if (!current || now - searched < 500) return;
          searched = now; searches++; region = find(squeeze(current.text));
          if (!region) return;
        }
        const text = squeeze(region.textContent);
        if (text === (shown?.text || '')) return;
        // The player's line changed: close the one that was showing, open the one that appeared.
        if (shown?.cue) lines.push({ start: shown.at - shown.cue.start, end: time - shown.cue.end, gapAfter: shown.gapAfter });
        const cue = text ? cues.filter(c => squeeze(c.text) === text).sort((a, b) => Math.abs(a.start - time) - Math.abs(b.start - time))[0] : null;
        const next = cue && cues.find(c => c.start >= cue.end);
        shown = text ? { text, at: time, cue: cue && Math.abs(cue.start - time) < 5 ? cue : null, gapAfter: cue && next ? next.start - cue.end : Infinity } : null;
      },
      // Seconds relative to the file: positive = the player is later than the file's time.
      summary() {
        if (!lines.length) return { measured: 0, searches, found: !!region };
        const part = list => ({ lines: list.length, appears: round(median(list.map(l => l.start))), disappears: round(median(list.map(l => l.end))) });
        return { measured: lines.length, searches, found: !!region, all: part(lines), beforeAnotherLine: part(lines.filter(l => l.gapAfter <= 0.1)), beforeAPause: part(lines.filter(l => l.gapAfter > 0.1)),
          last: lines.slice(-12).map(l => [round(l.start), round(l.end), l.gapAfter === Infinity ? null : round(l.gapAfter)]) };
      },
    };
  }
  scope.SubtitleProbe = { createProbe, squeeze };
})(globalThis);
