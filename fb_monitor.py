#!/usr/bin/env python3
"""
Failed Breakdown / Failed Breakout Monitor — April 14 2026
Based on TradeCompanion newsletter strategy.

LONG  (Failed Breakdown): price flushes BELOW key support → recovers → holds → BUY
SHORT (Failed Breakout):  price spikes ABOVE key resistance → fails back → holds → SELL

Entry: 2 contracts
Stop:  stop order covering both contracts
TP1:   limit order x1
TP2:   limit order x1
Guard: polls position qty — if flat unexpectedly, cancels all orphan orders

Run: python3 fb_monitor.py
"""

import subprocess, json, time, datetime, sys

# ── CONFIG ────────────────────────────────────────────────────────────────────
POLL_SECONDS  = 8
FLUSH_MARGIN  = 3.0    # pts beyond key level to confirm flush/spike
NAP_HOLD_BARS = 15     # consecutive polls holding before entry (~2 mins)
NAP_HOLD_PTS  = 5.0    # pts beyond key level required to count as recovery
QTY           = 2      # contracts per trade

CLI = ['node', 'src/cli/index.js']
CWD = '/Users/a.cangencdogus/tradingview-mcp-jackson'

# ── LONG SETUPS (Failed Breakdown) ───────────────────────────────────────────
# Price flushes below key_level → recovers above → holds → BUY
LONG_SETUPS = [
    {
        "label":     "LONG 1 — 6872 Level Reclaim",
        "key_level": 6872.0,
        "stop":      6858.0,
        "tp1":       6903.0,
        "tp2":       6917.0,
        "active":    True,
    },
    {
        "label":     "LONG 2 — 6848 Five-Touch Shelf",
        "key_level": 6848.0,
        "stop":      6836.0,
        "tp1":       6872.0,
        "tp2":       6886.0,
        "active":    True,
    },
    {
        "label":     "LONG 3 — 6802/6793 Deep Flush",
        "key_level": 6802.0,
        "stop":      6789.0,
        "tp1":       6832.0,
        "tp2":       6848.0,
        "active":    True,
    },
]

# ── SHORT SETUPS (Failed Breakout) ────────────────────────────────────────────
# Adam's strategy (TradeCompanion) is LONGS ONLY.
# place_short() is available as a manual skill but no setups are active here.
# To use: call place_short(setup, price) directly with a custom setup dict.
SHORT_SETUPS = []

# ── STATE INIT ────────────────────────────────────────────────────────────────
for s in LONG_SETUPS:
    s['state']          = 'WATCHING'
    s['flush_low']      = 9999.0
    s['recovery_count'] = 0

for s in SHORT_SETUPS:
    s['state']           = 'WATCHING'
    s['spike_high']      = 0.0
    s['recovery_count']  = 0

# ── LOW-LEVEL HELPERS ─────────────────────────────────────────────────────────
def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    print(f"[{ts}] {msg}", flush=True)

def js(code):
    r = subprocess.run(CLI + ['ui', 'eval', '--code', code],
                       capture_output=True, text=True, cwd=CWD, timeout=15)
    resp = json.loads(r.stdout) if r.stdout else {}
    return resp.get('result', '')

def get_price():
    try:
        r = subprocess.run(CLI + ['quote'], capture_output=True, text=True, cwd=CWD, timeout=10)
        d = json.loads(r.stdout)
        return float(d['last']), float(d['high']), float(d['low'])
    except Exception as e:
        log(f"ERROR getting price: {e}")
        return None, None, None

def set_input(index, value):
    return js(f"""
        var inputs = document.querySelectorAll('input[inputmode="decimal"]');
        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if(inputs[{index}]) {{
            ns.set.call(inputs[{index}], '{value}');
            inputs[{index}].dispatchEvent(new Event('input', {{bubbles:true}}));
            'inputs[{index}]=' + inputs[{index}].value;
        }} else {{ 'inputs[{index}] not found'; }}
    """)

def click_tab(label):
    return js(f"""
        var tab = Array.from(document.querySelectorAll('[role=tab]'))
                       .find(function(t){{ return t.textContent.trim() === '{label}'; }});
        tab ? (tab.click(), '{label} clicked') : '{label} not found';
    """)

def click_buy_btn():
    return js("""
        var btn = Array.from(document.querySelectorAll('button'))
                       .find(function(b){ return b.textContent.trim().startsWith('Buy') && b.className.includes('blue'); });
        btn ? (btn.click(), 'BUY: ' + btn.textContent.trim().slice(0,50)) : 'buy btn not found';
    """)

def click_sell_btn():
    return js("""
        var btn = Array.from(document.querySelectorAll('button'))
                       .find(function(b){ return b.textContent.trim().startsWith('Sell') && b.className.includes('red'); });
        btn ? (btn.click(), 'SELL: ' + btn.textContent.trim().slice(0,50)) : 'sell btn not found';
    """)

def buy_side():
    js("var b=document.querySelector('.buy-OnZ1FRe5'); if(b) b.click();")
    time.sleep(0.4)

def sell_side():
    js("var s=document.querySelector('.sell-OnZ1FRe5'); if(s) s.click();")
    time.sleep(0.4)

def screenshot():
    r = subprocess.run(CLI + ['screenshot'], capture_output=True, text=True, cwd=CWD)
    resp = json.loads(r.stdout) if r.stdout else {}
    return resp.get('file_path', 'none')

# ── POSITION / ORDER MANAGEMENT ───────────────────────────────────────────────
def get_position_qty():
    """Return open position qty, 0 if flat, -1 if unknown."""
    result = js("""
        var rows = Array.from(document.querySelectorAll('tr'));
        var posRow = rows.find(function(r){ return r.textContent.includes('CME_MINI'); });
        if(!posRow) { '0'; }
        else {
            var cells = posRow.querySelectorAll('td');
            cells.length > 2 ? cells[2].textContent.trim() : '0';
        }
    """)
    try:
        return float(result.replace(',', ''))
    except:
        return -1

def cancel_all_open_orders():
    """Cancel all open orders — cleans up orphan stops and TP limits."""
    log("  → Cancelling all open orders...")
    js("""
        var tabs = Array.from(document.querySelectorAll('[role=tab]'));
        var t = tabs.find(function(t){ return t.textContent.trim().startsWith('Orders'); });
        if(t) t.click();
    """)
    time.sleep(1.0)
    cancelled = js("""
        var btns = Array.from(document.querySelectorAll('button')).filter(function(b){
            return b.title==='Cancel order'||b.title==='Cancel'||
                   b.getAttribute('aria-label')==='Cancel order';
        });
        btns.forEach(function(b){ b.click(); });
        btns.length + ' orders cancelled';
    """)
    log(f"  {cancelled}")
    time.sleep(1.0)
    log(f"  Cleanup screenshot: {screenshot()}")

def open_trade_panel():
    subprocess.run(CLI + ['ui', 'click', '--by', 'text', '--value', 'Trade'],
                   capture_output=True, text=True, cwd=CWD)
    time.sleep(1.5)

# ── LONG ENTRY ────────────────────────────────────────────────────────────────
def place_long(setup, current_price):
    """Market buy 2 → sell stop x2 → sell limit TP1 x1 → sell limit TP2 x1"""
    log(f"  → LONG ENTRY")
    open_trade_panel()

    # Market Buy 2
    log(f"     {click_tab('Market')}")
    time.sleep(0.4)
    buy_side()
    log(f"     qty: {set_input(0, QTY)}")
    time.sleep(0.3)
    log(f"     {click_buy_btn()}")
    time.sleep(2.5)
    log(f"  Entry screenshot: {screenshot()}")

    # Sell Stop x2 (stop loss)
    time.sleep(0.5)
    log(f"  → Stop @ {setup['stop']} x{QTY}")
    sell_side()
    log(f"     {click_tab('Stop')}")
    time.sleep(0.4)
    log(f"     {set_input(0, setup['stop'])}")
    time.sleep(0.3)
    log(f"     {set_input(1, QTY)}")
    time.sleep(0.3)
    log(f"     {click_sell_btn()}")
    time.sleep(1.5)
    log(f"  Stop screenshot: {screenshot()}")

    # Sell Limit TP1 x1
    time.sleep(0.5)
    log(f"  → TP1 @ {setup['tp1']} x1")
    sell_side()
    log(f"     {click_tab('Limit')}")
    time.sleep(0.4)
    log(f"     {set_input(0, setup['tp1'])}")
    time.sleep(0.3)
    log(f"     {set_input(1, 1)}")
    time.sleep(0.3)
    log(f"     {click_sell_btn()}")
    time.sleep(1.5)

    # Sell Limit TP2 x1
    log(f"  → TP2 @ {setup['tp2']} x1")
    sell_side()
    log(f"     {click_tab('Limit')}")
    time.sleep(0.4)
    log(f"     {set_input(0, setup['tp2'])}")
    time.sleep(0.3)
    log(f"     {set_input(1, 1)}")
    time.sleep(0.3)
    log(f"     {click_sell_btn()}")
    time.sleep(1.5)
    log(f"  All orders screenshot: {screenshot()}")

# ── SHORT ENTRY ───────────────────────────────────────────────────────────────
def place_short(setup, current_price):
    """Market sell 2 → buy stop x2 → buy limit TP1 x1 → buy limit TP2 x1"""
    log(f"  → SHORT ENTRY")
    open_trade_panel()

    # Market Sell 2
    log(f"     {click_tab('Market')}")
    time.sleep(0.4)
    sell_side()
    log(f"     qty: {set_input(0, QTY)}")
    time.sleep(0.3)
    log(f"     {click_sell_btn()}")
    time.sleep(2.5)
    log(f"  Entry screenshot: {screenshot()}")

    # Buy Stop x2 (stop loss above entry)
    time.sleep(0.5)
    log(f"  → Stop @ {setup['stop']} x{QTY}")
    buy_side()
    log(f"     {click_tab('Stop')}")
    time.sleep(0.4)
    log(f"     {set_input(0, setup['stop'])}")
    time.sleep(0.3)
    log(f"     {set_input(1, QTY)}")
    time.sleep(0.3)
    log(f"     {click_buy_btn()}")
    time.sleep(1.5)
    log(f"  Stop screenshot: {screenshot()}")

    # Buy Limit TP1 x1 (below entry)
    time.sleep(0.5)
    log(f"  → TP1 @ {setup['tp1']} x1")
    buy_side()
    log(f"     {click_tab('Limit')}")
    time.sleep(0.4)
    log(f"     {set_input(0, setup['tp1'])}")
    time.sleep(0.3)
    log(f"     {set_input(1, 1)}")
    time.sleep(0.3)
    log(f"     {click_buy_btn()}")
    time.sleep(1.5)

    # Buy Limit TP2 x1 (further below entry)
    log(f"  → TP2 @ {setup['tp2']} x1")
    buy_side()
    log(f"     {click_tab('Limit')}")
    time.sleep(0.4)
    log(f"     {set_input(0, setup['tp2'])}")
    time.sleep(0.3)
    log(f"     {set_input(1, 1)}")
    time.sleep(0.3)
    log(f"     {click_buy_btn()}")
    time.sleep(1.5)
    log(f"  All orders screenshot: {screenshot()}")

# ── MARKET HOURS ──────────────────────────────────────────────────────────────
def check_price_in_market():
    now     = datetime.datetime.now()
    weekday = now.weekday()
    hour    = now.hour
    if weekday == 5:                  return False   # Saturday
    if weekday == 6 and hour < 18:    return False   # Sunday before 6pm ET
    if weekday == 4 and hour >= 17:   return False   # Friday after 5pm ET
    if hour == 17:                    return False   # 5-6pm daily halt
    return True

# ── MAIN LOOP ─────────────────────────────────────────────────────────────────
log("=" * 60)
log("FB MONITOR — Adam's Strategy (Longs Only)")
log("Watching: 6872 | 6848 | 6802/6793")
log("2 contracts | Stop order | TP1 + TP2 limits | Orphan guard")
log("Short capability available via place_short() — not auto-monitored")
log("=" * 60)

in_trade = False

try:
    while True:
        if not check_price_in_market():
            log("Market closed — waiting...")
            time.sleep(60)
            continue

        price, hi, lo = get_price()
        if price is None:
            time.sleep(POLL_SECONDS)
            continue

        log(f"ES {price:.2f}  |  H:{hi:.2f} L:{lo:.2f}")

        # ── POST-ENTRY GUARD ──────────────────────────────────────────────────
        if in_trade:
            qty = get_position_qty()
            if qty <= 0:
                log("  *** POSITION CLOSED — cancelling orphan orders ***")
                cancel_all_open_orders()
                in_trade = False
                log("  Monitor reset.")
            else:
                log(f"  → In trade. {qty:.0f} contracts open.")
            time.sleep(POLL_SECONDS)
            continue

        # ── LONG SETUPS (Failed Breakdown) ───────────────────────────────────
        for s in LONG_SETUPS:
            if not s['active']:
                continue
            kl = s['key_level']

            if s['state'] == 'WATCHING':
                if price < kl - FLUSH_MARGIN:
                    s['state']     = 'FLUSHING'
                    s['flush_low'] = price
                    log(f"  *** FLUSH: {s['label']} | {price:.2f} below {kl} ***")

            elif s['state'] == 'FLUSHING':
                if price < s['flush_low']:
                    s['flush_low'] = price
                    log(f"  Flush deepening: {price:.2f} (low {s['flush_low']:.2f})")
                if price > kl + NAP_HOLD_PTS:
                    s['state']          = 'RECOVERING'
                    s['recovery_count'] = 1
                    log(f"  *** RECOVERY: {s['label']} | {price:.2f} | 1/{NAP_HOLD_BARS} ***")

            elif s['state'] == 'RECOVERING':
                if price > kl + NAP_HOLD_PTS:
                    s['recovery_count'] += 1
                    log(f"  NAP hold: {s['label']} | {price:.2f} | {s['recovery_count']}/{NAP_HOLD_BARS}")
                    if s['recovery_count'] >= NAP_HOLD_BARS:
                        log(f"")
                        log(f"  ████████████████████████████████████████")
                        log(f"  █  LONG ENTRY: {s['label']}")
                        log(f"  █  ~{price:.2f}  Stop:{s['stop']}  TP1:{s['tp1']}  TP2:{s['tp2']}")
                        log(f"  ████████████████████████████████████████")
                        s['state'] = 'TRIGGERED'
                        s['active'] = False
                        place_long(s, price)
                        in_trade = True
                        for other in LONG_SETUPS + SHORT_SETUPS:
                            other['active'] = False
                else:
                    log(f"  NAP reset: {s['label']} | {price:.2f} dropped below {kl}")
                    s['state']          = 'FLUSHING'
                    s['recovery_count'] = 0

        # ── SHORT SETUPS (Failed Breakout) ────────────────────────────────────
        for s in SHORT_SETUPS:
            if not s['active']:
                continue
            kl = s['key_level']

            if s['state'] == 'WATCHING':
                if price > kl + FLUSH_MARGIN:
                    s['state']      = 'SPIKING'
                    s['spike_high'] = price
                    log(f"  *** SPIKE: {s['label']} | {price:.2f} above {kl} ***")

            elif s['state'] == 'SPIKING':
                if price > s['spike_high']:
                    s['spike_high'] = price
                    log(f"  Spike extending: {price:.2f} (high {s['spike_high']:.2f})")
                if price < kl - NAP_HOLD_PTS:
                    s['state']          = 'RECOVERING'
                    s['recovery_count'] = 1
                    log(f"  *** REJECTION: {s['label']} | {price:.2f} | 1/{NAP_HOLD_BARS} ***")

            elif s['state'] == 'RECOVERING':
                if price < kl - NAP_HOLD_PTS:
                    s['recovery_count'] += 1
                    log(f"  NAP hold: {s['label']} | {price:.2f} | {s['recovery_count']}/{NAP_HOLD_BARS}")
                    if s['recovery_count'] >= NAP_HOLD_BARS:
                        log(f"")
                        log(f"  ████████████████████████████████████████")
                        log(f"  █  SHORT ENTRY: {s['label']}")
                        log(f"  █  ~{price:.2f}  Stop:{s['stop']}  TP1:{s['tp1']}  TP2:{s['tp2']}")
                        log(f"  ████████████████████████████████████████")
                        s['state'] = 'TRIGGERED'
                        s['active'] = False
                        place_short(s, price)
                        in_trade = True
                        for other in LONG_SETUPS + SHORT_SETUPS:
                            other['active'] = False
                else:
                    log(f"  NAP reset: {s['label']} | {price:.2f} popped back above {kl}")
                    s['state']          = 'SPIKING'
                    s['recovery_count'] = 0

        time.sleep(POLL_SECONDS)

except KeyboardInterrupt:
    log("Monitor stopped by user.")
    sys.exit(0)
