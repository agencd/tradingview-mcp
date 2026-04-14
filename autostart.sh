#!/bin/bash
# Waits until 6:00pm ET, runs test buy, then starts FB monitor.
# All output logged to fb_test.log

LOG=/Users/a.cangencdogus/tradingview-mcp/fb_test.log
CWD=/Users/a.cangencdogus/tradingview-mcp

echo "[$(date '+%H:%M:%S')] autostart.sh launched — waiting for 6:00pm ET" | tee -a "$LOG"

# Wait until 18:00 ET
while true; do
    NOW_ET=$(TZ='America/New_York' date '+%H%M')
    if [ "$NOW_ET" -ge "1800" ]; then
        break
    fi
    SECS_LEFT=$(( ( 1800 - NOW_ET ) * 60 ))
    echo "[$(date '+%H:%M:%S')] ET time: $(TZ='America/New_York' date '+%H:%M') — waiting ${SECS_LEFT}s for 6pm..." | tee -a "$LOG"
    sleep 30
done

echo "[$(date '+%H:%M:%S')] *** 6:00 PM ET — MARKET OPEN — starting test buy ***" | tee -a "$LOG"

cd "$CWD"

# Run test buy
python3 test_buy.py 2>&1 | tee -a "$LOG"

echo "[$(date '+%H:%M:%S')] Test buy complete. Starting FB monitor..." | tee -a "$LOG"

# Start the real monitor (logs everything)
python3 fb_monitor.py 2>&1 | tee -a "$LOG"
