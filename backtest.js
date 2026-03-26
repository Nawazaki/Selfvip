/**
 * Run backtest using the trained model on historical data
 */
async function runBacktest() {
  const days = parseInt(document.getElementById('backtestDays').value);
  const symbol = document.getElementById('symbolInput').value.toUpperCase();
  const market = document.getElementById('marketType').value;
  if (market !== 'crypto') {
    alert('Backtest currently supports crypto only.');
    return;
  }
  if (!window.mlModel) {
    alert('No trained model. Please train or load a model first.');
    return;
  }

  const limit = days * 24; // 1h candles
  const closes = await fetchHistoricalData(symbol, '1h', limit);
  if (!closes.length) throw new Error('No data');
  const seqLength = parseInt(document.getElementById('mlSeqLength').value);
  if (closes.length < seqLength + 10) throw new Error('Not enough data for backtest');

  // Normalize using the same scaler used during training (if available)
  let normalized;
  if (window.scalerMin !== null && window.scalerMax !== null) {
    normalized = closes.map(v => (v - window.scalerMin) / (window.scalerMax - window.scalerMin));
  } else {
    const { normalized: n } = normalize(closes);
    normalized = n;
  }

  const { X, y } = createSequences(normalized, seqLength);
  if (X.length === 0) throw new Error('No sequences');

  // Predict on each sequence
  const predictions = [];
  for (let i = 0; i < X.length; i++) {
    const input = tf.tensor([X[i]], [1, seqLength, 1], 'float32');
    const pred = window.mlModel.predict(input);
    const predVal = (await pred.data())[0];
    predictions.push(predVal);
  }

  // Compare with actual direction (simple up/down)
  let correct = 0;
  for (let i = 0; i < predictions.length; i++) {
    const predictedDir = predictions[i] > 0.5 ? 1 : 0;
    const actualDir = y[i];
    if (predictedDir === actualDir) correct++;
  }
  const accuracy = correct / predictions.length;
  document.getElementById('backtestResult').innerHTML = `
    Backtest on last ${predictions.length} candles: Accuracy = ${(accuracy*100).toFixed(2)}%<br>
    Total predictions: ${predictions.length}
  `;
  document.getElementById('backtestResult').classList.remove('hidden');
}
