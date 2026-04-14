#!/usr/bin/env python3
"""
Test Buy Script — runs once at market open to verify paper trade execution.
After the test, hands off to the real fb_monitor.py.
"""

import subprocess, json, time, datetime, sys, os

CLI = ['node', 'src/cli/index.js']
CWD = '/Users/a.cangencdogus/tradingview-mcp'
LOG = '/Users/a.cangencdogus/tradingview-mcp/fb_test.log'

def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG, 'a') as f:
        f.write(line + '\n')

def get_price():
    try:
        r = subprocess.run(CLI + ['quote'], capture_output=True, text=True, cwd=CWD, timeout=10)
        d = json.loads(r.stdout)
        return float(d['last'])
    except Exception as e:
        log(f"ERROR getting price: {e}")
        return None

def run_test_buy():
    log("=" * 60)
    log("TEST BUY — verifying paper trade execution pipeline")
    log("=" * 60)

    price = get_price()
    if price is None:
        log("FAIL: Could not get price. Aborting test.")
        return False

    log(f"Current ES price: {price:.2f}")

    # Step 1: Open Trade panel
    log("Step 1: Opening Trade panel...")
    r = subprocess.run(CLI + ['ui', 'click', '--by', 'text', '--value', 'Trade'],
                       capture_output=True, text=True, cwd=CWD)
    result = json.loads(r.stdout) if r.stdout else {}
    log(f"  Trade panel: {result.get('success', False)}")
    time.sleep(1.5)

    # Step 2: Check inputs exist
    log("Step 2: Checking order form inputs...")
    r = subprocess.run(CLI + ['ui', 'eval', '--code',
        'var inputs = document.querySelectorAll(\'input[inputmode="decimal"]\'); '
        'JSON.stringify(Array.from(inputs).map(function(x,i){return {idx:i,val:x.value};}));'
    ], capture_output=True, text=True, cwd=CWD)
    result = json.loads(r.stdout) if r.stdout else {}
    log(f"  Inputs found: {result.get('result', 'none')}")

    # Step 3: Set a test stop loss (price - 15 pts, paper trade safety margin)
    test_stop = round(price - 15.0, 2)
    log(f"Step 3: Setting stop loss to {test_stop}...")
    r = subprocess.run(CLI + ['ui', 'eval', '--code',
        f"""
        var inputs = document.querySelectorAll('input[inputmode="decimal"]');
        var result = 'no stop input found';
        if(inputs[3]) {{
            var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            nativeSetter.set.call(inputs[3], '{test_stop}');
            inputs[3].dispatchEvent(new Event('input', {{bubbles:true}}));
            result = 'stop set to ' + inputs[3].value;
        }}
        result;
        """
    ], capture_output=True, text=True, cwd=CWD)
    result = json.loads(r.stdout) if r.stdout else {}
    log(f"  Stop result: {result.get('result', 'unknown')}")
    time.sleep(0.5)

    # Step 4: Click Buy
    log("Step 4: Clicking Buy button...")
    r = subprocess.run(CLI + ['ui', 'click', '--by', 'text', '--value', 'Buy'],
                       capture_output=True, text=True, cwd=CWD)
    result = json.loads(r.stdout) if r.stdout else {}
    log(f"  Buy click result: {result}")
    time.sleep(1.5)

    # Step 5: Screenshot to confirm order
    log("Step 5: Taking screenshot...")
    r = subprocess.run(CLI + ['screenshot'], capture_output=True, text=True, cwd=CWD)
    result = json.loads(r.stdout) if r.stdout else {}
    log(f"  Screenshot: {result.get('file_path', 'none')}")

    # Step 6: Check if position opened
    log("Step 6: Checking open positions...")
    r = subprocess.run(CLI + ['ui', 'eval', '--code',
        'var rows = document.querySelectorAll(".positions-table tbody tr, [data-name=\\"positions-table\\"] tr");'
        'rows.length + " position rows found";'
    ], capture_output=True, text=True, cwd=CWD)
    result = json.loads(r.stdout) if r.stdout else {}
    log(f"  Positions check: {result.get('result', 'unknown')}")

    log("=" * 60)
    log("TEST COMPLETE — check screenshot and log above")
    log("=" * 60)
    return True


if __name__ == '__main__':
    success = run_test_buy()
    sys.exit(0 if success else 1)
