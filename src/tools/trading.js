import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/trading.js';

export function registerTradingTools(server) {
  server.tool(
    'tv_buy_market',
    'Place a market BUY order in TradingView for the current symbol. Opens the Trade panel, switches to buy side, selects Market order type, sets quantity, and submits.',
    {
      qty: z.coerce.number().int().positive().optional().describe('Number of contracts/shares to buy (default 1)'),
    },
    async ({ qty }) => {
      try { return jsonResult(await core.buyMarket({ qty: qty ?? 1 })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );

  server.tool(
    'tv_sell_market',
    'Place a market SELL order in TradingView for the current symbol. Opens the Trade panel, switches to sell side, selects Market order type, sets quantity, and submits.',
    {
      qty: z.coerce.number().int().positive().optional().describe('Number of contracts/shares to sell (default 1)'),
    },
    async ({ qty }) => {
      try { return jsonResult(await core.sellMarket({ qty: qty ?? 1 })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );
}
