const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('  // Schedule loader');
const end = source.indexOf('  // Contact form handler', start);
assert(start >= 0 && end > start);
const loader = source.slice(start, end);
const event = { id: 123, venue: '確認会場', area: '九州', start: '2026-11-05', end: '2026-11-08' };

async function render(events, fail = false) {
  const container = { innerHTML: '' };
  vm.runInNewContext(loader, {
    document: { getElementById: () => container },
    fetch: () => fail ? Promise.reject(new Error('offline')) : Promise.resolve({ json: () => Promise.resolve(events) }),
  });
  await new Promise(resolve => setImmediate(resolve));
  return container.innerHTML;
}

test('usual schedule keeps the card, dates and event link', async () => {
  const html = await render([event]);
  assert(html.includes('href="/events/123/"'));
  assert(html.includes('確認会場'));
  assert(html.includes('11月') && html.includes('〜8日'));
  assert(html.includes('催事一覧を見る'));
});
test('venue punctuation is represented as text', async () => {
  const html = await render([{ ...event, venue: '本店 <本館> & "東口" \'西口\'' }]);
  assert(html.includes('本店 &lt;本館&gt; &amp; &quot;東口&quot; &#39;西口&#39;'));
  assert(!html.includes('<本館>'));
});
test('the name fallback is also represented as text', async () => {
  const html = await render([{ ...event, venue: '', name: '<別会場>' }]);
  assert(html.includes('&lt;別会場&gt;'));
  assert(!html.includes('<別会場>'));
});
test('area punctuation is represented as text', async () => {
  const html = await render([{ ...event, area: '<九州> & 関西' }]);
  assert(html.includes('&lt;九州&gt; &amp; 関西'));
});
test('event ids remain one URL path component', async () => {
  const html = await render([{ ...event, id: '会場/"本館"?日程' }]);
  assert(html.includes('href="/events/' + encodeURIComponent('会場/"本館"?日程') + '/"'));
  assert(!html.includes('href="/events/会場/"'));
});
test('events without an id keep the non-link card', async () => {
  const html = await render([{ ...event, id: null }]);
  assert(html.includes('<div class="schedule-card">'));
  assert(!html.includes('href="/events/123/"'));
});
test('empty schedules keep their notice', async () => {
  assert((await render([])).includes('現在予定されている催事はありません'));
});
test('failed reads keep their notice', async () => {
  assert((await render([], true)).includes('スケジュール情報を取得できませんでした'));
});
