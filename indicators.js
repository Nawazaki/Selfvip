// Technical Indicators

/**
 * Calculate RSI (Relative Strength Index)
 * @param {number[]} prices - Array of close prices
 * @param {number} period - RSI period (default 14)
 * @returns {number[]} RSI values
 */
function calculateRSI(prices, period = 14) {
  if (prices.length <= period) return [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i-1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const rsi = [100 - (100 / (1 + avgGain / (avgLoss || 1)))];
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i-1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
    rsi.push(100 - (100 / (1 + avgGain / (avgLoss || 1))));
  }
  return rsi;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param {number[]} prices - Array of close prices
 * @param {number} fast - Fast EMA period (default 12)
 * @param {number} slow - Slow EMA period (default 26)
 * @param {number} signal - Signal line period (default 9)
 * @returns {Object} { macdLine, signalLine, histogram }
 */
function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
  if (prices.length < slow) return { macdLine: [], signalLine: [], histogram: [] };
  const emaFast = [];
  const emaSlow = [];
  const multiplierFast = 2 / (fast + 1);
  const multiplierSlow = 2 / (slow + 1);
  const multiplierSignal = 2 / (signal + 1);
  let emaFastPrev = prices[0];
  let emaSlowPrev = prices[0];
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      emaFast.push(prices[0]);
      emaSlow.push(prices[0]);
    } else {
      const valFast = (prices[i] - emaFastPrev) * multiplierFast + emaFastPrev;
      const valSlow = (prices[i] - emaSlowPrev) * multiplierSlow + emaSlowPrev;
      emaFast.push(valFast);
      emaSlow.push(valSlow);
      emaFastPrev = valFast;
      emaSlowPrev = valSlow;
    }
  }
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = [];
  let signalPrev = macdLine[0];
  for (let i = 0; i < macdLine.length; i++) {
    if (i === 0) signalLine.push(macdLine[0]);
    else {
      const val = (macdLine[i] - signalPrev) * multiplierSignal + signalPrev;
      signalLine.push(val);
      signalPrev = val;
    }
  }
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}
