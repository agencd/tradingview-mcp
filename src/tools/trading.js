import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/trading.js';

export function registerTradingTools(server) {
  server.tool(
    'tv_buy_market',
    'Place a market BUY order in TradingView. Optionally switch to a different symbol first (e.g. symbol="nq" switches to NQ1! before buying).',
    {
      qty:    z.coerce.number().int().positive().optional().describe('Number of contracts/shares (default 1)'),
      symbol: z.string().optional().describe('Symbol to trade, e.g. "nq", "es", "NQ1!", "AAPL". Omit to use current chart symbol.'),
    },
    async ({ qty, symbol }) => {
      try { return jsonResult(await core.buyMarket({ qty: qty ?? 1, symbol })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );

  server.tool(
    'tv_sell_market',
    'Place a market SELL order in TradingView. Optionally switch to a different symbol first (e.g. symbol="nq" switches to NQ1! before selling).',
    {
      qty:    z.coerce.number().int().positive().optional().describe('Number of contracts/shares (default 1)'),
      symbol: z.string().optional().describe('Symbol to trade, e.g. "nq", "es", "NQ1!", "AAPL". Omit to use current chart symbol.'),
    },
    async ({ qty, symbol }) => {
      try { return jsonResult(await core.sellMarket({ qty: qty ?? 1, symbol })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );
}
