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
 * Returns { success, action, qty, submitted_text }
 */
export async function buyMarket({ qty = 1 } = {}) {
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
    qty,
    submitted_text: result.text,
  };
}

/**
 * Place a market sell order for `qty` contracts.
 * Returns { success, action, qty, submitted_text }
 */
export async function sellMarket({ qty = 1 } = {}) {
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
    qty,
    submitted_text: result.text,
  };
}
