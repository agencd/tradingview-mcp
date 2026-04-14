import { register } from '../router.js';
import * as core from '../../core/trading.js';

register('buy', {
  description: 'Place a market buy order',
  options: {
    quantity: { type: 'string', short: 'q', description: 'Number of contracts/shares (default 1)' },
    symbol:   { type: 'string', short: 's', description: 'Symbol, e.g. nq, es, NQ1! (default: current chart)' },
  },
  handler: (opts) => core.buyMarket({
    qty:    opts.quantity ? Number(opts.quantity) : 1,
    symbol: opts.symbol || undefined,
  }),
});

register('sell', {
  description: 'Place a market sell order',
  options: {
    quantity: { type: 'string', short: 'q', description: 'Number of contracts/shares (default 1)' },
    symbol:   { type: 'string', short: 's', description: 'Symbol, e.g. nq, es, NQ1! (default: current chart)' },
  },
  handler: (opts) => core.sellMarket({
    qty:    opts.quantity ? Number(opts.quantity) : 1,
    symbol: opts.symbol || undefined,
  }),
});
