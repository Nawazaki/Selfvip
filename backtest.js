async function runBacktest() {
  const days = parseInt(document.getElementById('backtestDays').value);
  const symbol = document.getElementById('symbolInput').value.toUpperCase();
  const market = document.getElementById('marketType').value;
  if (market !== 'crypto') {
    alert('Backtest currently supports crypto only.');
    return;
  }
  const limit = days * 24; // 1h candles
  const closes = await fetchHistoricalData(symbol, '1h', limit);
  if (!closes.length) throw new Error('No data');
  const seqLength = parseInt(document.getElementById('mlSeqLength').value);
  if (closes.length < seqLength + 10) throw new Error('Not enough data for backtest');

  // تطبيع البيانات بنفس طريقة التدريب
  const { normalized } = normalize(closes);
  const { X, y } = createSequences(normalized, seqLength);
  if (X.length === 0) throw new Error('No sequences');

  // استخدام النموذج المحفوظ (إذا كان موجوداً) أو تدريب مؤقت
  let model = mlModel;
  if (!model) {
    alert('No trained model. Please train first.');
    return;
  }

  // تنبؤات على التسلسلات الأخيرة
  const predictions = [];
  for (let i = 0; i < X.length; i++) {
    const input = tf.tensor([X[i]], [1, seqLength, 1], 'float32');
    const pred = model.predict(input);
    const prob = (await pred.data())[0];
    predictions.push(prob > 0.5 ? 1 : 0);
  }

  // حساب دقة التنبؤ مقابل القيم الفعلية
  let correct = 0;
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] === y[i]) correct++;
  }
  const accuracy = correct / predictions.length;
  document.getElementById('backtestResult').innerHTML = `
    Backtest on last ${predictions.length} candles: Accuracy = ${(accuracy*100).toFixed(2)}%<br>
    Total predictions: ${predictions.length}
  `;
  document.getElementById('backtestResult').classList.remove('hidden');
}
