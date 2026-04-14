import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/trading.js';

export function registerTradingTools(server) {
  server.tool(
    'tv_buy_market',
    'Place a market BUY order. Optionally set stop loss (points below entry) and one or two take profits (points above entry). With two TPs, 1 contract closes at each level.',
    {
      quantity: z.coerce.number().int().positive().optional().describe('Number of contracts (default 1)'),
      symbol:   z.string().optional().describe('Symbol, e.g. "nq", "es", "NQ1!". Omit to use current chart.'),
      profit:   z.array(z.coerce.number().positive()).optional().describe('Take profit(s) in points above entry, e.g. [10] or [10, 15]'),
      loss:     z.coerce.number().positive().optional().describe('Stop loss in points below entry, e.g. 15'),
    },
    async ({ quantity, symbol, profit, loss }) => {
      try { return jsonResult(await core.buyMarket({ qty: quantity ?? 1, symbol, tp: profit ?? [], sl: loss })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );

  server.tool(
    'tv_sell_market',
    'Place a market SELL order. Optionally set stop loss (points above entry) and one or two take profits (points below entry). With two TPs, 1 contract closes at each level.',
    {
      quantity: z.coerce.number().int().positive().optional().describe('Number of contracts (default 1)'),
      symbol:   z.string().optional().describe('Symbol, e.g. "nq", "es", "NQ1!". Omit to use current chart.'),
      profit:   z.array(z.coerce.number().positive()).optional().describe('Take profit(s) in points below entry, e.g. [10] or [10, 15]'),
      loss:     z.coerce.number().positive().optional().describe('Stop loss in points above entry, e.g. 15'),
    },
    async ({ quantity, symbol, profit, loss }) => {
      try { return jsonResult(await core.sellMarket({ qty: quantity ?? 1, symbol, tp: profit ?? [], sl: loss })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );
}
