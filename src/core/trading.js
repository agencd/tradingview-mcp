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
 *   Qty input        : inputs[inputmode="decimal"][0]  (Market — no price field)
 *   Limit/Stop price : inputs[inputmode="decimal"][0], qty at [1]
 *   Buy submit btn   : button where text starts "Buy" and className includes "blue"
 *   Sell submit btn  : button where text starts "Sell" and className includes "red"
 */
import { evaluate } from '../connection.js';
import { setSymbol } from './chart.js';
import { getQuote } from './data.js';

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

// Round to nearest tick (default 0.25 for ES/NQ futures)
function roundTick(price, tick = 0.25) {
  return Math.round(price / tick) * tick;
}

// ─── DOM helpers ───────────────────────────────────────────────────────────

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
  await new Promise(r => setTimeout(r, 600));
}

async function clickBuySide() {
  await js(`var el = document.querySelector('.buy-OnZ1FRe5'); if (el) el.click();`);
  await new Promise(r => setTimeout(r, 300));
}

async function clickSellSide() {
  await js(`var el = document.querySelector('.sell-OnZ1FRe5'); if (el) el.click();`);
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

async function setInput(index, value) {
  const v = String(value);
  await js(`
    var inputs = document.querySelectorAll('input[inputmode="decimal"]');
    if (inputs[${index}]) {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      setter.set.call(inputs[${index}], '${v}');
      inputs[${index}].dispatchEvent(new Event('input', { bubbles: true }));
    }
  `);
  await new Promise(r => setTimeout(r, 200));
}

async function clickBuyButton() {
  const result = await js(`
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.textContent.trim().startsWith('Buy') && b.className.includes('blue')) {
        var txt = b.textContent.trim(); b.click(); return { clicked: true, text: txt };
      }
    }
    return { clicked: false };
  `);
  if (!result || !result.clicked) throw new Error('Buy submit button not found');
  return result.text;
}

async function clickSellButton() {
  const result = await js(`
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.textContent.trim().startsWith('Sell') && b.className.includes('red')) {
        var txt = b.textContent.trim(); b.click(); return { clicked: true, text: txt };
      }
    }
    return { clicked: false };
  `);
  if (!result || !result.clicked) throw new Error('Sell submit button not found');
  return result.text;
}

// ─── order helpers ─────────────────────────────────────────────────────────

// Place a sell-stop order (used as stop loss for a long position)
async function placeSellStop(price, qty) {
  await clickSellSide();
  await clickOrderTypeTab('Stop');
  await setInput(0, roundTick(price)); // price
  await setInput(1, qty);              // qty
  await clickSellButton();
  await new Promise(r => setTimeout(r, 400));
}

// Place a sell-limit order (take profit for a long position)
async function placeSellLimit(price, qty) {
  await clickSellSide();
  await clickOrderTypeTab('Limit');
  await setInput(0, roundTick(price)); // price
  await setInput(1, qty);              // qty
  await clickSellButton();
  await new Promise(r => setTimeout(r, 400));
}

// Place a buy-stop order (used as stop loss for a short position)
async function placeBuyStop(price, qty) {
  await clickBuySide();
  await clickOrderTypeTab('Stop');
  await setInput(0, roundTick(price));
  await setInput(1, qty);
  await clickBuyButton();
  await new Promise(r => setTimeout(r, 400));
}

// Place a buy-limit order (take profit for a short position)
async function placeBuyLimit(price, qty) {
  await clickBuySide();
  await clickOrderTypeTab('Limit');
  await setInput(0, roundTick(price));
  await setInput(1, qty);
  await clickBuyButton();
  await new Promise(r => setTimeout(r, 400));
}

// ─── public API ────────────────────────────────────────────────────────────

/**
 * Place a market buy order, optionally with stop loss and take profit(s).
 * @param {object} opts
 * @param {number}   [opts.qty=1]      Number of contracts
 * @param {string}   [opts.symbol]     e.g. "nq", "NQ1!"
 * @param {number[]} [opts.tp=[]]      Take profit levels in points above entry (e.g. [10, 15])
 * @param {number}   [opts.sl]         Stop loss in points below entry (e.g. 15)
 */
export async function buyMarket({ qty = 1, symbol, tp = [], sl } = {}) {
  const sym = resolveSymbol(symbol);
  if (sym) await setSymbol({ symbol: sym });

  // Snapshot price before entry if TP/SL requested
  let entryPrice = null;
  if (tp.length > 0 || sl != null) {
    const quote = await getQuote({});
    entryPrice = quote.last ?? quote.close;
    if (!entryPrice) throw new Error('Could not get current price for TP/SL calculation');
  }

  await ensureTradePanel();
  await clickBuySide();
  await clickOrderTypeTab('Market');
  await setInput(0, qty);
  const btnText = await clickBuyButton();
  await new Promise(r => setTimeout(r, 500)); // let fill settle

  const orders = [];

  // Stop loss — full qty
  if (sl != null && entryPrice) {
    const slPrice = roundTick(entryPrice - sl);
    await placeSellStop(slPrice, qty);
    orders.push({ type: 'stop_loss', price: slPrice, qty });
  }

  // Take profits — split qty across levels if multiple
  if (tp.length > 0 && entryPrice) {
    const tpQty = tp.length > 1 ? 1 : qty;
    for (const pts of tp) {
      const tpPrice = roundTick(entryPrice + pts);
      await placeSellLimit(tpPrice, tpQty);
      orders.push({ type: 'take_profit', price: tpPrice, qty: tpQty });
    }
  }

  return {
    success: true,
    action: 'buy_market',
    symbol: sym || 'current',
    qty,
    entry_ref: entryPrice,
    submitted_text: btnText,
    orders,
  };
}

/**
 * Place a market sell order, optionally with stop loss and take profit(s).
 * @param {object} opts
 * @param {number}   [opts.qty=1]      Number of contracts
 * @param {string}   [opts.symbol]     e.g. "nq", "NQ1!"
 * @param {number[]} [opts.tp=[]]      Take profit levels in points below entry (e.g. [10, 15])
 * @param {number}   [opts.sl]         Stop loss in points above entry (e.g. 15)
 */
export async function sellMarket({ qty = 1, symbol, tp = [], sl } = {}) {
  const sym = resolveSymbol(symbol);
  if (sym) await setSymbol({ symbol: sym });

  let entryPrice = null;
  if (tp.length > 0 || sl != null) {
    const quote = await getQuote({});
    entryPrice = quote.last ?? quote.close;
    if (!entryPrice) throw new Error('Could not get current price for TP/SL calculation');
  }

  await ensureTradePanel();
  await clickSellSide();
  await clickOrderTypeTab('Market');
  await setInput(0, qty);
  const btnText = await clickSellButton();
  await new Promise(r => setTimeout(r, 500));

  const orders = [];

  // Stop loss — full qty
  if (sl != null && entryPrice) {
    const slPrice = roundTick(entryPrice + sl);
    await placeBuyStop(slPrice, qty);
    orders.push({ type: 'stop_loss', price: slPrice, qty });
  }

  // Take profits
  if (tp.length > 0 && entryPrice) {
    const tpQty = tp.length > 1 ? 1 : qty;
    for (const pts of tp) {
      const tpPrice = roundTick(entryPrice - pts);
      await placeBuyLimit(tpPrice, tpQty);
      orders.push({ type: 'take_profit', price: tpPrice, qty: tpQty });
    }
  }

  return {
    success: true,
    action: 'sell_market',
    symbol: sym || 'current',
    qty,
    entry_ref: entryPrice,
    submitted_text: btnText,
    orders,
  };
}
