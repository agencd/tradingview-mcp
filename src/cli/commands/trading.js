import { register } from '../router.js';
import * as core from '../../core/trading.js';

register('buy', {
  description: 'Place a market buy order for the current symbol',
  options: {
    qty: { type: 'string', short: 'q', description: 'Number of contracts/shares (default 1)' },
  },
  handler: (opts) => core.buyMarket({ qty: opts.qty ? Number(opts.qty) : 1 }),
});

register('sell', {
  description: 'Place a market sell order for the current symbol',
  options: {
    qty: { type: 'string', short: 'q', description: 'Number of contracts/shares (default 1)' },
  },
  handler: (opts) => core.sellMarket({ qty: opts.qty ? Number(opts.qty) : 1 }),
});
