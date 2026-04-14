import { register } from '../router.js';
import * as core from '../../core/trading.js';

const tradeOptions = {
  quantity: { type: 'string',  short: 'q', description: 'Number of contracts (default 1)' },
  symbol:   { type: 'string',  short: 's', description: 'Symbol, e.g. nq, es, NQ1! (default: current chart)' },
  profit:   { type: 'string',  short: 'p', multiple: true, description: 'Take profit in points (repeatable: -p 10 -p 15)' },
  loss:     { type: 'string',  short: 'l', description: 'Stop loss in points' },
};

register('buy', {
  description: 'Place a market buy order  [buy -s es -q 2 -p 10 -p 15 -l 15]',
  options: tradeOptions,
  handler: (opts) => core.buyMarket({
    qty:    opts.quantity ? Number(opts.quantity) : 1,
    symbol: opts.symbol   || undefined,
    tp:     opts.profit   ? (Array.isArray(opts.profit) ? opts.profit : [opts.profit]).map(Number) : [],
    sl:     opts.loss     ? Number(opts.loss) : undefined,
  }),
});

register('sell', {
  description: 'Place a market sell order  [sell -s es -q 2 -p 10 -p 15 -l 15]',
  options: tradeOptions,
  handler: (opts) => core.sellMarket({
    qty:    opts.quantity ? Number(opts.quantity) : 1,
    symbol: opts.symbol   || undefined,
    tp:     opts.profit   ? (Array.isArray(opts.profit) ? opts.profit : [opts.profit]).map(Number) : [],
    sl:     opts.loss     ? Number(opts.loss) : undefined,
  }),
});
