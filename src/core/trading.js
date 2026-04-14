/**
 * Core trading logic — market order execution via TradingView Trade panel (CDP).
 *
 * Uses the React native setter pattern to set input values (standard .value = x
 * does not trigger React re-renders in TradingView's order form).
 *
 * Selector notes (verified against live TradingView Desktop):
 *   Buy side toggle  : .buy-OnZ1FRe5
 *   Sell side toggle : .sell-OnZ1FRe5
 *   Order type tabs  : [role=tab] — text "Market", "Limit", "Stop"
 *   Qty input        : inputs[inputmode="decimal"][0]  (Market order — no price field)
 *   Buy submit btn   : button where text starts "Buy" and className includes "blue"
 *   Sell submit btn  : button where text starts "Sell" and className includes "red"
 */
import { evaluate } from '../connection.js';
import { setSymbol } from './chart.js';

// ─── symbol normalizer ─────────────────────────────────────────────────────

const ALIAS = {
  es: 'ES1!', nq: 'NQ1!', ym: 'YM1!', rty: 'RTY1!',
  cl: 'CL1!', gc: 'GC1!', si: 'SI1!', ng: 'NG1!',
  zb: 'ZB1!', zn: 'ZN1!', zf: 'ZF1!',
  eur: 'EURUSD', gbp: 'GBPUSD', jpy: 'USDJPY',
  spy: 'SPY', qqq: 'QQQ', iwm: 'IWM',
};

function resolveSymbol(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALIAS[key] || raw.toUpperCase();
}

// ─── helpers ───────────────────────────────────────────────────────────────

async function js(code) {
  return evaluate(`(function(){ ${code} })()`);
}

async function ensureTradePanel() {
  await js(`
    var btn = document.querySelector('[data-name="trading-button"]')
           || document.querySelector('[aria-label="Trading Panel"]');
    if (btn) {
      var isActive = btn.getAttribute('aria-pressed') === 'true'
                  || btn.className.includes('active')
                  || btn.className.includes('Active');
      if (!isActive) btn.click();
    }
  `);
  // Give panel time to render
  await new Promise(r => setTimeout(r, 600));
}

async function clickBuySide() {
  await js(`
    var el = document.querySelector('.buy-OnZ1FRe5');
    if (el) el.click();
  `);
  await new Promise(r => setTimeout(r, 300));
}

async function clickSellSide() {
  await js(`
    var el = document.querySelector('.sell-OnZ1FRe5');
    if (el) el.click();
  `);
  await new Promise(r => setTimeout(r, 300));
}

async function clickOrderTypeTab(label) {
  await js(`
    var tabs = document.querySelectorAll('[role=tab]');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].textContent.trim() === '${label}') { tabs[i].click(); break; }
    }
  `);
  await new Promise(r => setTimeout(r, 300));
}

async function setQty(qty) {
  const v = String(qty);
  await js(`
    var inputs = document.querySelectorAll('input[inputmode="decimal"]');
    if (inputs[0]) {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      setter.set.call(inputs[0], '${v}');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    }
  `);
  await new Promise(r => setTimeout(r, 200));
}

// ─── public API ────────────────────────────────────────────────────────────

/**
 * Place a market buy order for `qty` contracts.
 * @param {object} opts
 * @param {number} [opts.qty=1]
 * @param {string} [opts.symbol]  — e.g. "nq", "NQ1!", "ES1!"
 */
export async function buyMarket({ qty = 1, symbol } = {}) {
  const sym = resolveSymbol(symbol);
  if (sym) await setSymbol({ symbol: sym });
  await ensureTradePanel();
  await clickBuySide();
  await clickOrderTypeTab('Market');
  await setQty(qty);

  const result = await js(`
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.textContent.trim().startsWith('Buy') && b.className.includes('blue')) {
        var txt = b.textContent.trim();
        b.click();
        return { clicked: true, text: txt };
      }
    }
    return { clicked: false };
  `);

  if (!result || !result.clicked) {
    throw new Error('Buy submit button not found — is the Trade panel open and a symbol loaded?');
  }

  return {
    success: true,
    action: 'buy_market',
    symbol: sym || 'current',
    qty,
    submitted_text: result.text,
  };
}

/**
 * Place a market sell order for `qty` contracts.
 * @param {object} opts
 * @param {number} [opts.qty=1]
 * @param {string} [opts.symbol]  — e.g. "nq", "NQ1!", "ES1!"
 */
export async function sellMarket({ qty = 1, symbol } = {}) {
  const sym = resolveSymbol(symbol);
  if (sym) await setSymbol({ symbol: sym });
  await ensureTradePanel();
  await clickSellSide();
  await clickOrderTypeTab('Market');
  await setQty(qty);

  const result = await js(`
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.textContent.trim().startsWith('Sell') && b.className.includes('red')) {
        var txt = b.textContent.trim();
        b.click();
        return { clicked: true, text: txt };
      }
    }
    return { clicked: false };
  `);

  if (!result || !result.clicked) {
    throw new Error('Sell submit button not found — is the Trade panel open and a symbol loaded?');
  }

  return {
    success: true,
    action: 'sell_market',
    symbol: sym || 'current',
    qty,
    submitted_text: result.text,
  };
}
