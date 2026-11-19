// 新しいトップページ（top.js）の催事スケジュールのテスト。tests/test_schedule_display.cjs と同じ中身で、読む先を top.js に替えたもの。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'top.js'), 'utf8');
const start = source.indexOf('  // Schedule loader');
const end = source.indexOf('  // Contact form handler', start);
assert(start >= 0 && end > start);
const loader = source.slice(start, end);
const event = { id: 123, venue: '確認会場', area: '九州', start: '2026-11-05', end: '2026-11-08' };

async function render(events, fail = false) {
  const container = { innerHTML: '' };
  vm.runInNewContext(loader, {
    document: { getElementById: () => container },
    HP_CONFIG: { mode: 'local', apiBase: 'http://local.test', stripeKey: 'pk_test_dummy', canSend: true, blockedMessage: '', ready: Promise.resolve() },
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
  // 新しい見た目（top.css）の名前で組まれている
  assert(html.includes('<a class="ev" href="/events/123/">'));
  assert(html.includes('<span class="ev-m">11月</span><span class="ev-d">5</span><span class="ev-r">〜8日</span>'));
  assert(html.includes('<a href="/events/" class="btn btn-line">'));
  assert(!/style=/.test(html));
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
  assert(html.includes('<div class="ev">'));
  assert(!html.includes('href="/events/123/"'));
});
test('empty schedules keep their notice', async () => {
  assert((await render([])).includes('現在予定されている催事はありません'));
});
test('failed reads keep their notice', async () => {
  assert((await render([], true)).includes('スケジュール情報を取得できませんでした'));
});
test('schedule is read from the HP_CONFIG endpoint', async () => {
  const urls = [];
  vm.runInNewContext(loader, {
    document: { getElementById: () => ({ innerHTML: '' }) },
    HP_CONFIG: { apiBase: 'http://local.test' },
    fetch: url => { urls.push(url); return Promise.resolve({ json: () => Promise.resolve([]) }); },
  });
  assert.deepEqual(urls, ['http://local.test/events/api/public/schedule']);
});
