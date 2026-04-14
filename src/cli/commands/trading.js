import { register } from '../router.js';
import * as core from '../../core/trading.js';

register('buy', {
  description: 'Place a market buy order',
  options: {
    qty: { type: 'string', short: 'q', description: 'Number of contracts/shares (default 1)' },
    con: { type: 'string', short: 'c', description: 'Contract/symbol, e.g. nq, es, NQ1! (default: current chart)' },
  },
  handler: (opts) => core.buyMarket({
    qty:    opts.qty ? Number(opts.qty) : 1,
    symbol: opts.con || undefined,
  }),
});

register('sell', {
  description: 'Place a market sell order',
  options: {
    qty: { type: 'string', short: 'q', description: 'Number of contracts/shares (default 1)' },
    con: { type: 'string', short: 'c', description: 'Contract/symbol, e.g. nq, es, NQ1! (default: current chart)' },
  },
  handler: (opts) => core.sellMarket({
    qty:    opts.qty ? Number(opts.qty) : 1,
    symbol: opts.con || undefined,
  }),
});
