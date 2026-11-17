(() => {
  'use strict';

  // ====== ルーティーンの初期値（ここを書き換えても、画面の「設定」からでも編集できます） ======
  // days: 実施する曜日（0=日, 1=月, ... 6=土）
  const DEFAULT_ROUTINES = [
    { name: 'サンプル：朝起きたら水を飲む', days: [0, 1, 2, 3, 4, 5, 6] },
    { name: 'サンプル：運動する', days: [1, 3, 5] },
    { name: 'サンプル：寝る前に読書', days: [0, 1, 2, 3, 4, 5, 6] },
  ];

  const KEY = 'routine-tracker-v1';
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 月曜始まり

  // ---------- 日付ユーティリティ ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- 保存・読み込み ----------
  function freshState() {
    const t = ymd(today());
    return {
      routines: DEFAULT_ROUTINES.map((r) => ({ id: uid(), name: r.name, days: [...r.days], createdAt: t })),
      records: {},
    };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.routines) && s.records) return s;
    } catch (e) { /* 読めない場合は初期化 */ }
    return freshState();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert('保存に失敗しました'); }
  }

  let state = load();
  let view = 'day';
  let cursor = today();

  // ---------- 判定ロジック ----------
  const scheduled = (r, ds) => r.days.includes(parse(ds).getDay()) && ds >= r.createdAt;
  const isDone = (id, ds) => (state.records[ds] || []).includes(id);

  function toggle(id, ds) {
    if (ds > ymd(today())) return; // 未来日はチェック不可
    const list = state.records[ds] || [];
    state.records[ds] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    if (!state.records[ds].length) delete state.records[ds];
    save();
  }

  function dayStats(ds) {
    const rs = state.routines.filter((r) => scheduled(r, ds));
    return { total: rs.length, done: rs.filter((r) => isDone(r.id, ds)).length };
  }

  // 期間内（今日まで）の達成数
  function routineStats(r, from, to) {
    const t = ymd(today());
    let total = 0, done = 0;
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      const ds = ymd(d);
      if (ds > t) break;
      if (!scheduled(r, ds)) continue;
      total++;
      if (isDone(r.id, ds)) done++;
    }
    return { total, done };
  }

  function rangeStats(from, to) {
    let total = 0, done = 0;
    state.routines.forEach((r) => { const s = routineStats(r, from, to); total += s.total; done += s.done; });
    return { total, done };
  }

  // 連続達成日数（今日が未チェックなら昨日から数える）
  function streak(r) {
    let d = today();
    if (scheduled(r, ymd(d)) && !isDone(r.id, ymd(d))) d = addDays(d, -1);
    let n = 0;
    for (let i = 0; i < 3650; i++, d = addDays(d, -1)) {
      const ds = ymd(d);
      if (ds < r.createdAt) break;
      if (!scheduled(r, ds)) continue;
      if (isDone(r.id, ds)) n++; else break;
    }
    return n;
  }

  const pct = (s) => (s.total ? Math.round((s.done / s.total) * 100) : 0);

  function summaryBlock(s, unit) {
    const p = pct(s);
    return `
      <div class="summary"><span class="big">${s.total ? p + '%' : '–'}</span>
        <span class="sub">${s.done} / ${s.total} ${unit}</span></div>
      <div class="progress"><div style="width:${p}%"></div></div>`;
  }

  // ---------- 日次 ----------
  function renderDay() {
    const ds = ymd(cursor), t = ymd(today());
    const isToday = ds === t, future = ds > t;
    const rs = state.routines.filter((r) => scheduled(r, ds));
    const s = dayStats(ds);
    const sub = isToday ? '今日' : ds === ymd(addDays(today(), -1)) ? '昨日' : '<button data-act="goto-today">今日に戻る</button>';

    const items = rs.map((r) => {
      const done = isDone(r.id, ds);
      const st = isToday ? streak(r) : 0;
      return `<li><button class="item ${done ? 'done' : ''}" data-act="toggle" data-id="${r.id}" data-date="${ds}" ${future ? 'disabled' : ''}>
        <span class="check" aria-hidden="true"></span>
        <span class="name">${esc(r.name)}</span>
        ${st > 1 ? `<span class="streak">${st}日連続</span>` : ''}
      </button></li>`;
    }).join('');

    let cheer = '';
    if (!future && s.total && s.done === s.total) cheer = '全部できました。おつかれさま！';
    else if (future) cheer = '';

    return `
      <section class="card">
        <div class="nav">
          <button data-act="prev-day" aria-label="前の日">‹</button>
          <div class="label">${cursor.getMonth() + 1}月${cursor.getDate()}日（${WD[cursor.getDay()]}）<small>${sub}</small></div>
          <button data-act="next-day" aria-label="次の日">›</button>
        </div>
        ${summaryBlock(s, '完了')}
        ${cheer ? `<p class="cheer">${cheer}</p>` : ''}
      </section>
      <section class="card">
        ${rs.length ? `<ul class="checklist">${items}</ul>` : '<p class="empty">この日のルーティーンはありません</p>'}
        ${future ? '<p class="note">未来の日はチェックできません</p>' : ''}
      </section>`;
  }

  // ---------- 週次 ----------
  function renderWeek() {
    const start = weekStart(cursor), end = addDays(start, 6);
    const t = ymd(today());
    const days = [...Array(7)].map((_, i) => addDays(start, i));
    const s = rangeStats(start, end);

    const head = days.map((d) => `<th class="${ymd(d) === t ? 'is-today' : ''}">${WD[d.getDay()]}<br>${d.getDate()}</th>`).join('');
    const rows = state.routines.map((r) => {
      const cells = days.map((d) => {
        const ds = ymd(d);
        if (!scheduled(r, ds)) return '<td class="na">–</td>';
        const done = isDone(r.id, ds);
        const cls = ds > t ? 'future' : done ? 'done' : ds < t ? 'miss' : '';
        return `<td><button class="cell ${cls}" data-act="toggle" data-id="${r.id}" data-date="${ds}" ${ds > t ? 'disabled' : ''} aria-label="${esc(r.name)} ${ds}">${done ? '✓' : ''}</button></td>`;
      }).join('');
      const rs = routineStats(r, start, end);
      return `<tr><td class="rname">${esc(r.name)}</td>${cells}<td class="rate">${rs.total ? pct(rs) + '%' : '–'}</td></tr>`;
    }).join('');
    const foot = days.map((d) => {
      const ds = ymd(d);
      if (ds > t) return '<td></td>';
      const ds2 = dayStats(ds);
      return `<td>${ds2.total ? pct(ds2) + '%' : '–'}</td>`;
    }).join('');

    return `
      <section class="card">
        <div class="nav">
          <button data-act="prev-week" aria-label="前の週">‹</button>
          <div class="label">${start.getMonth() + 1}/${start.getDate()} 〜 ${end.getMonth() + 1}/${end.getDate()}
            <small>${ymd(start) === ymd(weekStart(today())) ? '今週' : '<button data-act="goto-today">今週に戻る</button>'}</small></div>
          <button data-act="next-week" aria-label="次の週">›</button>
        </div>
        ${summaryBlock(s, '完了（今日まで）')}
      </section>
      <section class="card">
        ${state.routines.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th class="rname">ルーティーン</th>${head}<th>率</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td class="rname">日別</td>${foot}<td></td></tr></tfoot>
        </table></div>
        <p class="note">マスをタップすると、その日のチェックを付け外しできます。</p>` : '<p class="empty">ルーティーンがありません。「設定」から追加してください</p>'}
      </section>`;
  }

  // ---------- 月次 ----------
  function renderMonth() {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const t = ymd(today());
    const s = rangeStats(first, last);

    let cells = WD_ORDER.map((i) => `<div class="wd">${WD[i]}</div>`).join('');
    cells += '<div></div>'.repeat((first.getDay() + 6) % 7);
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(y, m, d), ds = ymd(date);
      let cls = '', label = '';
      if (ds > t) cls = 'future';
      else {
        const st = dayStats(ds);
        if (st.total) {
          const p = pct(st);
          cls = p === 100 ? 'lv3' : p >= 50 ? 'lv2' : p > 0 ? 'lv1' : 'lv0';
          label = `${st.done}/${st.total}`;
        }
      }
      if (ds === t) cls += ' is-today';
      cells += `<button class="day ${cls}" data-act="open-day" data-date="${ds}">${d}${label ? `<small>${label}</small>` : ''}</button>`;
    }

    const list = state.routines.map((r) => {
      const rs = routineStats(r, first, last);
      return `<li><div class="top"><span>${esc(r.name)}</span><span><b>${rs.total ? pct(rs) + '%' : '–'}</b><small>${rs.done}/${rs.total}日</small></span></div>
        <div class="progress"><div style="width:${pct(rs)}%"></div></div></li>`;
    }).join('');

    const isThisMonth = y === today().getFullYear() && m === today().getMonth();
    return `
      <section class="card">
        <div class="nav">
          <button data-act="prev-month" aria-label="前の月">‹</button>
          <div class="label">${y}年${m + 1}月<small>${isThisMonth ? '今月' : '<button data-act="goto-today">今月に戻る</button>'}</small></div>
          <button data-act="next-month" aria-label="次の月">›</button>
        </div>
        ${summaryBlock(s, '完了（今日まで）')}
      </section>
      <section class="card">
        <div class="cal">${cells}</div>
        <div class="legend">
          <span><i style="background:var(--lv0)"></i>0%</span>
          <span><i style="background:var(--lv1)"></i>〜49%</span>
          <span><i style="background:var(--lv2)"></i>50〜99%</span>
          <span><i style="background:var(--lv3)"></i>100%</span>
        </div>
        <p class="note">日付をタップするとその日のチェック画面に移動します。</p>
      </section>
      <section class="card">
        <h2>ルーティーン別の達成率</h2>
        ${state.routines.length ? `<ul class="rlist">${list}</ul>` : '<p class="empty">ルーティーンがありません</p>'}
      </section>`;
  }

  // ---------- 設定 ----------
  function renderSettings() {
    const rows = state.routines.map((r, i) => `
      <div class="r-row">
        <div class="line1">
          <input class="r-name" data-id="${r.id}" value="${esc(r.name)}" aria-label="ルーティーン名">
          <button class="icon-btn" data-act="up" data-id="${r.id}" ${i === 0 ? 'disabled' : ''} aria-label="上へ">↑</button>
          <button class="icon-btn" data-act="down" data-id="${r.id}" ${i === state.routines.length - 1 ? 'disabled' : ''} aria-label="下へ">↓</button>
          <button class="icon-btn danger" data-act="del" data-id="${r.id}">削除</button>
        </div>
        <div class="wds">${WD_ORDER.map((w) => `<button class="wdb ${r.days.includes(w) ? 'on' : ''}" data-act="wd" data-id="${r.id}" data-wd="${w}">${WD[w]}</button>`).join('')}</div>
      </div>`).join('');

    return `
      <section class="card">
        <h2>ルーティーン</h2>
        ${rows || '<p class="empty">まだありません</p>'}
        <p class="note">名前はタップして編集できます。曜日ボタンで実施する曜日を選べます。</p>
      </section>
      <section class="card">
        <h2>追加</h2>
        <div class="add">
          <input class="add-name" id="add-name" placeholder="例：朝ストレッチ10分" aria-label="新しいルーティーン名">
          <button class="primary" data-act="add">追加</button>
        </div>
        <p class="note">追加した日から集計に含まれます（それ以前の日は未達扱いになりません）。</p>
      </section>
      <section class="card">
        <h2>データ</h2>
        <div class="btns">
          <button class="ghost" data-act="export">バックアップを保存</button>
          <button class="ghost" data-act="import">バックアップを読み込む</button>
          <button class="ghost" data-act="reset" style="color:#c0453a">すべてリセット</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
        <p class="note">記録はこのブラウザの中に保存されます。スマホとPCなど別の端末では共有されないので、端末を移るときはバックアップを使ってください。</p>
      </section>`;
  }

  // ---------- 描画 ----------
  function render() {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    const el = document.getElementById('app');
    el.innerHTML = { day: renderDay, week: renderWeek, month: renderMonth, settings: renderSettings }[view]();
  }

  function addRoutine() {
    const input = document.getElementById('add-name');
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    state.routines.push({ id: uid(), name, days: [0, 1, 2, 3, 4, 5, 6], createdAt: ymd(today()) });
    save(); render();
    document.getElementById('add-name').focus();
  }

  const find = (id) => state.routines.find((r) => r.id === id);

  // ---------- イベント ----------
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    view = b.dataset.view;
    render();
    window.scrollTo(0, 0);
  });

  const app = document.getElementById('app');

  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const { act, id } = b.dataset;

    switch (act) {
      case 'toggle': toggle(id, b.dataset.date); break;
      case 'prev-day': cursor = addDays(cursor, -1); break;
      case 'next-day': cursor = addDays(cursor, 1); break;
      case 'prev-week': cursor = addDays(cursor, -7); break;
      case 'next-week': cursor = addDays(cursor, 7); break;
      case 'prev-month': cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); break;
      case 'next-month': cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); break;
      case 'goto-today': cursor = today(); break;
      case 'open-day': cursor = parse(b.dataset.date); view = 'day'; window.scrollTo(0, 0); break;
      case 'wd': {
        const r = find(id), w = Number(b.dataset.wd);
        if (r.days.includes(w)) {
          if (r.days.length === 1) { alert('少なくとも1つの曜日を選んでください'); return; }
          r.days = r.days.filter((x) => x !== w);
        } else r.days.push(w);
        save(); break;
      }
      case 'up':
      case 'down': {
        const i = state.routines.findIndex((r) => r.id === id);
        const j = act === 'up' ? i - 1 : i + 1;
        [state.routines[i], state.routines[j]] = [state.routines[j], state.routines[i]];
        save(); break;
      }
      case 'del': {
        const r = find(id);
        if (!confirm(`「${r.name}」を削除しますか？\nこのルーティーンの集計は表示されなくなります。`)) return;
        state.routines = state.routines.filter((x) => x.id !== id);
        save(); break;
      }
      case 'add': addRoutine(); return;
      case 'export': {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `routine-backup-${ymd(today())}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        return;
      }
      case 'import': document.getElementById('import-file').click(); return;
      case 'reset':
        if (!confirm('ルーティーンとすべての記録を消して初期状態に戻しますか？\nこの操作は元に戻せません。')) return;
        state = freshState(); save(); break;
      default: return;
    }
    render();
  });

  app.addEventListener('change', (e) => {
    if (e.target.classList.contains('r-name')) {
      const r = find(e.target.dataset.id);
      const name = e.target.value.trim();
      if (name) { r.name = name; save(); } else e.target.value = r.name;
    }
    if (e.target.id === 'import-file') {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const s = JSON.parse(reader.result);
          if (!Array.isArray(s.routines) || typeof s.records !== 'object') throw new Error();
          if (!confirm('現在のデータをバックアップの内容で置き換えますか？')) return;
          state = s; save(); render();
        } catch (err) { alert('読み込めないファイルです'); }
      };
      reader.readAsText(file);
    }
  });

  app.addEventListener('keydown', (e) => {
    if (e.target.id === 'add-name' && e.key === 'Enter' && !e.isComposing) addRoutine();
  });

  // 日付が変わったら（タブを開きっぱなしでも）「今日」を更新
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  render();
})();
