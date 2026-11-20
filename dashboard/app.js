// Token Radar dashboard, radar-3.
//
// Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board as a filterable table, a per-protocol detail view with
// the model's own inputs and the protocol's farm plan, and a model
// sandbox that recomputes implied values live. No network: every byte
// it shows is already in data.js, and the page makes no request at all.
//
// The farm plan is not derived here: board.json carries each row's eight
// steps whole, and the page shows them as written, so the screenshots,
// the code and the board can never disagree about a plan.

(() => {
  'use strict';

  const DATA = window.RADAR;
  if (!DATA) return;

  const app = document.getElementById('board');

  // The page's whole state: the filters, the sort, the tab, the selected
  // protocol, and the sandbox constants the reader is trying out.
  const state = {
    q: '',
    category: 'all',
    chain: 'all',
    growth: 'all',
    minTvl: 0,
    tab: 'pre-token',
    sort: 'implied',
    dir: -1,
    selected: null,
    sandbox: { exponent: DATA.model.size_exponent, weight: DATA.model.growth_weight },
  };
  let sandboxOn = false;

  const usdFull = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFull.format(n);
  }

  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function, radar-3: the page recomputes a row from
  // the snapshot figures and checks the number board.json carries, so
  // the page's code and the board's data are visibly the same arithmetic.
  // Size is TVL compressed to the 0.75 power, so giants lead but never
  // win by size alone; the launch multiple (0.05 .. 0.50) is a quality
  // score from growth, age and breadth. The sandbox changes only the
  // two constants it shows; the submitted board is the model as shipped,
  // and a sandbox row is recomputed.
  function impliedOf(row, model) {
    const eff = Math.pow(row.tvl_usd / model.size_unit, model.size_exponent) * model.size_unit;
    const rawGrowth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
    const growthNorm = (growth - model.growth_floor) / (model.growth_cap - model.growth_floor);
    const age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    const ageNorm = Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days;
    const breadthNorm = Math.min((row.chains || []).length, model.breadth_chains) / model.breadth_chains;
    const quality = model.growth_weight * growthNorm + model.age_weight * ageNorm + model.breadth_weight * breadthNorm;
    const multiple = model.multiple_floor + model.multiple_range * quality;
    return Math.max(1, Math.round(eff * multiple));
  }

  function modelNow() {
    const m = {};
    for (const k in DATA.model) m[k] = DATA.model[k];
    m.size_exponent = state.sandbox.exponent;
    m.growth_weight = state.sandbox.weight;
    return m;
  }

  function shownImplied(row) {
    return sandboxOn ? impliedOf(row, modelNow()) : row.implied_value_usd;
  }

  // A tiny element builder: tag, attributes, then children. `text` sets
  // text content, `class` sets the class, `on*` keys attach listeners,
  // everything else becomes an attribute.
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (value !== null && value !== undefined) node.setAttribute(key, value);
      }
    }
    for (const child of children) {
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) {
        for (const c of child) if (c) node.appendChild(c);
      } else if (typeof child === 'string') {
        node.appendChild(document.createTextNode(child));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  // The filter state lives in the URL hash, so a filtered view and a
  // detail view can each be linked to.
  function readHash() {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }

  function writeHash() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    const next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    const q = state.q.trim().toLowerCase();
    return DATA.rows.filter((r) => {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.growth === 'up' && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.growth === 'down' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (!q) return true;
      const hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sortValue(row) {
    if (state.sort === 'name') return row.name.toLowerCase();
    if (state.sort === 'tvl') return row.tvl_usd;
    if (state.sort === 'growth') return row.change_7d === null ? -Infinity : row.change_7d;
    if (state.sort === 'age') return row.age_days === null ? Infinity : row.age_days;
    return shownImplied(row);
  }

  function sortedRows(list) {
    return list.slice().sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })));
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' clean pre-token protocols below that floor — none of them a wrapped, staked or bridged product. Implied value is a model, not a promise.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))));
  }

  function selectField(id, label, options, value, onChange) {
    const select = el('select', { id, 'aria-label': label },
      options.map((o) => el('option', { value: String(o[0]), text: o[1], selected: String(o[0]) === String(value) ? 'selected' : null })));
    select.addEventListener('change', () => { onChange(select.value); writeHash(); render(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), select);
  }

  function clearFilters() {
    state.q = '';
    state.category = 'all';
    state.chain = 'all';
    state.growth = 'all';
    state.minTvl = 0;
    writeHash();
    render();
  }

  function controls() {
    const categories = Array.from(new Set(DATA.rows.map((r) => r.category || 'Other'))).sort();
    const chains = Array.from(new Set(DATA.rows.flatMap((r) => r.chains || []))).sort();
    const search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', () => { state.q = search.value; writeHash(); render(); });
    const pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: () => { state.tab = 'pre-token'; render(); } });
    const live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: () => { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', [['all', 'All categories']].concat(categories.map((c) => [c, c])), state.category, (v) => { state.category = v; }),
      selectField('chain', 'Chain', [['all', 'All chains']].concat(chains.map((c) => [c, c])), state.chain, (v) => { state.chain = v; }),
      selectField('growth', '7-day growth', [['all', 'Any growth'], ['up', 'Growing only'], ['down', 'Falling only']], state.growth, (v) => { state.growth = v; }),
      selectField('mintvl', 'Minimum TVL', [[0, 'Any TVL'], [50000000, '$50M+'], [100000000, '$100M+'], [500000000, '$500M+']], state.minTvl, (v) => { state.minTvl = Number(v); }),
      el('div', { class: 'field' },
        el('span', { class: 'sub', text: 'Token status' }),
        el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' rows shown' + (sandboxOn ? ' · sandbox model' : '') : DATA.live.length + ' live-token protocols' }));
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', {
        type: 'button',
        onclick: () => {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = -1; }
          render();
        },
      }, label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null));
  }

  function protocolCell(row) {
    const chains = row.chains && row.chains.length ? row.chains.slice(0, 2).join(', ') : 'an unnamed chain';
    return el('td', null,
      el('div', { class: 'name' },
        el('span', null,
          el('b', { text: row.name }),
          row.watchlist ? el('span', { class: 'badge watch', text: 'watchlist' }) : null),
        el('span', { class: 'sub', text: (row.category || 'Other') + ' on ' + chains })));
  }

  function boardTable() {
    const list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' },
        el('div', { class: 'empty' },
          el('h2', { text: 'No protocol matches that filter' }),
          el('p', { text: 'Clear the search or pick another category to see the board again.' }),
          el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: clearFilters })));
    }
    const max = list.reduce((m, r) => Math.max(m, shownImplied(r)), 1);
    const tbody = el('tbody');
    for (const r of list) {
      const growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      const growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const rowEl = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: () => openDetail(r.slug),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      },
        el('td', { class: 'num', text: String(r.rank) }),
        protocolCell(r),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null,
          el('div', { class: 'implied' },
            el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownImplied(r) / max) * 100)) + '%' })),
            el('span', { class: 'num', text: fmtUsd(shownImplied(r)) }))),
        el('td', null, el('span', { class: 'status', text: 'records no token' })));
      tbody.appendChild(rowEl);
    }
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null,
            el('tr', null,
              sortHeader('implied', 'Rank'),
              sortHeader('name', 'Protocol'),
              sortHeader('tvl', 'TVL'),
              sortHeader('growth', '7d'),
              sortHeader('age', 'Age'),
              sortHeader('implied', 'Implied value'),
              el('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  }

  function liveTable() {
    const tbody = el('tbody');
    for (const r of DATA.live) {
      const chains = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null,
          el('div', { class: 'name' },
            el('b', { text: r.name }),
            el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + chains }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))));
    }
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null,
            el('tr', null,
              el('th', { scope: 'col', text: 'Status' }),
              el('th', { scope: 'col', text: 'Protocol' }),
              el('th', { scope: 'col', text: 'TVL' }),
              el('th', { scope: 'col', text: '7d' }),
              el('th', { scope: 'col', text: 'Market cap' }),
              el('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  }

  function modelPanel() {
    const m = DATA.model;
    function slider(id, label, min, max, step, value, onInput) {
      const out = el('b', { text: String(value) });
      const input = el('input', { type: 'range', id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      input.addEventListener('input', () => { out.textContent = input.value; onInput(Number(input.value)); });
      return el('label', { for: id }, label + ' ', out, input);
    }
    const reset = el('button', {
      class: 'button',
      type: 'button',
      text: 'Reset sandbox',
      onclick: () => { state.sandbox = { exponent: DATA.model.size_exponent, weight: DATA.model.growth_weight }; sandboxOn = false; render(); },
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( (tvl_usd / 1,000,000) ^ ' + m.size_exponent + ' x 1,000,000 x (' + m.multiple_floor + ' + ' + m.multiple_range + ' x quality) )'),
      el('div', { class: 'weights' },
        el('div', null, el('span', { text: 'Size — TVL to the ' + m.size_exponent + ' power' }), el('b', { text: 'compressed' })),
        el('div', null, el('span', { text: 'Growth — 7-day change, clamped ' + m.growth_floor + '% .. +' + m.growth_cap + '%' }), el('b', { text: 'weight ' + m.growth_weight })),
        el('div', null, el('span', { text: 'Age — days listed, capped at ' + m.maturity_days + ' days' }), el('b', { text: 'weight ' + m.age_weight })),
        el('div', null, el('span', { text: 'Breadth — chains, capped at ' + m.breadth_chains }), el('b', { text: 'weight ' + m.breadth_weight }))),
      el('p', { class: 'sub', text: 'Size is compressed because a token\u2019s value does not grow in step with the value its protocol secures: doubling TVL does not double what a token is worth. The snapshot\u2019s TVL spans about 550x; the 0.75 power compresses that to about 113x, so giants lead but never win by size alone. Growth is clamped because one week can print +4,448% in this snapshot and must never decide the ranking; it carries the largest weight because it says where the TVL is heading. Age is the track record of running with no token, capped at four years, and an unlisted age uses ' + m.unknown_age_days + ' days. Breadth is reach: each chain up to five widens the user base a token could serve. The multiple runs 0.05 .. 0.50 of the compressed size — the radar\u2019s own calibration, never a market fact. The early radar is every clean pre-token protocol the watchlist leaves out, and the live-token protocols are set aside with their market caps shown.' }),
      el('h3', { text: 'Model sandbox — try the constants, the board re-ranks' }),
      el('div', { class: 'sandbox' },
        slider('sb-exp', 'Size exponent', 0.5, 1, 0.05, state.sandbox.exponent, (v) => { state.sandbox.exponent = v; sandboxOn = true; render(); }),
        slider('sb-weight', 'Growth weight', 0, 0.9, 0.05, state.sandbox.weight, (v) => { state.sandbox.weight = v; sandboxOn = true; render(); }),
        el('div', null,
          el('span', { class: 'sub', text: sandboxOn ? 'Sandbox on: values below are recomputed, board.json keeps the shipped model.' : 'Sandbox off: the board shows the shipped model.' }),
          reset)));
  }

  const dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', () => { state.selected = null; writeHash(); });

  function openDetail(slug) {
    const row = DATA.rows.filter((r) => r.slug === slug)[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    const steps = row.farm_steps || [];
    const recomputed = impliedOf(row, DATA.model);
    const checkText = sandboxOn
      ? ' The sandbox is on, so this number is the sandbox model, not the shipped board.'
      : recomputed === row.implied_value_usd
        ? ', the same number board.json carries.'
        : ', which differs from the board: the data would be stale.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: () => dialog.close() })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Effective TVL (TVL ^ ' + DATA.model.size_exponent + ')' }), el('b', { class: 'num', text: fmtUsd(row.effective_tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' → ' + row.growth_norm.toFixed(3) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + ' → ' + row.age_norm.toFixed(3) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) + ' → ' + row.breadth_norm.toFixed(3) })),
        el('div', null, el('span', { text: 'Quality (0.45 growth + 0.35 age + 0.20 breadth)' }), el('b', { class: 'num', text: row.quality.toFixed(3) })),
        el('div', null, el('span', { text: 'Launch multiple' }), el('b', { class: 'num', text: row.multiple.toFixed(3) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
      el('p', { class: 'sub', text: row.model_breakdown }),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + checkText + ' This is an estimate, not a price. It records no token — the snapshot carries no token for it, which is not proof it has none.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — ' + steps.length + ' steps' }),
      el('ol', { class: 'steps' }, steps.map((s) => {
        const at = s.indexOf(' Cost: ');
        const action = at >= 0 ? s.slice(0, at) : s;
        const tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    const shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'note', text: 'Snapshot ' + DATA.as_of + ' · Source: ' + DATA.source + ' · Implied values are this radar\u2019s own claim, never make.fun\u2019s. A protocol is described as recording no token when the snapshot carries no token for it.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
