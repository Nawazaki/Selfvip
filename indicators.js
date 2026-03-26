// حساب RSI
function calculateRSI(prices, period = 14) {
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

// حساب MACD
function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
  const emaFast = [];
  const emaSlow = [];
  let multiplierFast = 2 / (fast + 1);
  let multiplierSlow = 2 / (slow + 1);
  let multiplierSignal = 2 / (signal + 1);
  let emaFastPrev = prices[0];
  let emaSlowPrev = prices[0];
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      emaFast.push(prices[0]);
      emaSlow.push(prices[0]);
    } else {
      let valFast = (prices[i] - emaFastPrev) * multiplierFast + emaFastPrev;
      let valSlow = (prices[i] - emaSlowPrev) * multiplierSlow + emaSlowPrev;
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
      let val = (macdLine[i] - signalPrev) * multiplierSignal + signalPrev;
      signalLine.push(val);
      signalPrev = val;
    }
  }
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}
