// ========== إعدادات ML ==========
let mlModel = null;
let scalerMin = null, scalerMax = null;

// جلب البيانات التاريخية (إغلاق فقط)
async function fetchHistoricalData(symbol, interval = '1h', limit = 1000) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Binance API error');
  const data = await response.json();
  return data.map(candle => parseFloat(candle[4])); // سعر الإغلاق
}

// تطبيع min-max
function normalize(data) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const normalized = data.map(val => (val - min) / (max - min));
  return { normalized, min, max };
}

// إنشاء تسلسلات الإدخال والإخراج
function createSequences(data, seqLength) {
  const X = [], y = [];
  for (let i = seqLength; i < data.length; i++) {
    X.push(data.slice(i - seqLength, i));
    // التسمية: 1 إذا السعر القادم أعلى من السعر الحالي، وإلا 0
    y.push(data[i] > data[i-1] ? 1 : 0);
  }
  return { X, y };
}

// بناء النموذج
function buildModel(seqLength) {
  const model = tf.sequential();
  model.add(tf.layers.lstm({
    units: 50,
    inputShape: [seqLength, 1],
    returnSequences: false
  }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
  model.compile({
    optimizer: tf.train.adam(),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy']
  });
  return model;
}

// دالة التدريب الرئيسية
async function trainAndPredict() {
  const symbol = document.getElementById('symbolInput').value.toUpperCase();
  const marketType = document.getElementById('marketType').value;
  if (marketType !== 'crypto') {
    alert('ML prediction currently only supports crypto assets.');
    return;
  }

  const candleCount = parseInt(document.getElementById('mlCandlesCount').value);
  const seqLength = parseInt(document.getElementById('mlSeqLength').value);
  const epochs = parseInt(document.getElementById('mlEpochs').value);

  const statusDiv = document.getElementById('mlStatus');
  const resultDiv = document.getElementById('mlResult');
  const trainBtn = document.getElementById('trainModelBtn');

  trainBtn.disabled = true;
  trainBtn.innerText = '⏳ Fetching data...';
  statusDiv.classList.remove('hidden');
  statusDiv.innerText = 'Fetching historical data...';
  resultDiv.classList.add('hidden');

  try {
    // 1. جلب البيانات
    const closes = await fetchHistoricalData(symbol, '1h', candleCount);
    if (closes.length < seqLength + 10) throw new Error('Not enough data');

    // 2. تطبيع
    const { normalized, min, max } = normalize(closes);
    scalerMin = min;
    scalerMax = max;

    // 3. إنشاء التسلسلات
    const { X, y } = createSequences(normalized, seqLength);
    if (X.length === 0) throw new Error('Cannot create sequences');

    // 4. تقسيم تدريب/اختبار (80/20)
    const splitIndex = Math.floor(X.length * 0.8);
    const X_train = X.slice(0, splitIndex);
    const y_train = y.slice(0, splitIndex);
    const X_val = X.slice(splitIndex);
    const y_val = y.slice(splitIndex);

    // 5. تحويل إلى Tensors
    const trainX = tf.tensor3d(X_train, [X_train.length, seqLength, 1]);
    const trainY = tf.tensor2d(y_train, [y_train.length, 1]);
    const valX = tf.tensor3d(X_val, [X_val.length, seqLength, 1]);
    const valY = tf.tensor2d(y_val, [y_val.length, 1]);

    // 6. بناء النموذج
    statusDiv.innerText = 'Building model...';
    mlModel = buildModel(seqLength);

    // 7. تدريب النموذج
    statusDiv.innerText = `Training for ${epochs} epochs...`;
    trainBtn.innerText = '🧠 Training...';

    const history = await mlModel.fit(trainX, trainY, {
      epochs: epochs,
      validationData: [valX, valY],
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          statusDiv.innerText = `Epoch ${epoch+1}/${epochs} - loss: ${logs.loss.toFixed(4)} - acc: ${logs.acc.toFixed(4)} - val_acc: ${logs.val_acc.toFixed(4)}`;
        }
      }
    });

    // 8. التنبؤ بالشمعة القادمة
    const lastSeq = normalized.slice(-seqLength);
    const inputPred = tf.tensor3d([lastSeq], [1, seqLength, 1]);
    const prediction = mlModel.predict(inputPred);
    const prob = (await prediction.data())[0];
    const direction = prob > 0.5 ? 'bullish' : 'bearish';
    const confidence = direction === 'bullish' ? prob : 1 - prob;

    // عرض النتيجة
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
      <span class="text-purple-400">Next Candle Prediction:</span><br>
      <span class="text-xl font-bold ${direction === 'bullish' ? 'text-emerald-400' : 'text-rose-400'}">${direction.toUpperCase()}</span><br>
      <span class="text-xs">Confidence: ${(confidence * 100).toFixed(2)}%</span><br>
      <span class="text-[10px] text-slate-500">(Based on last ${seqLength} candles, ${epochs} epochs)</span>
    `;
    statusDiv.innerText = `Training complete. Final accuracy: ${history.history.val_acc[history.history.val_acc.length-1].toFixed(4)}`;
  } catch (err) {
    console.error(err);
    statusDiv.innerText = `Error: ${err.message}`;
    resultDiv.classList.add('hidden');
  } finally {
    trainBtn.disabled = false;
    trainBtn.innerText = '🧠 Start Training';
  }
}

// ربط الزر عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  const trainBtn = document.getElementById('trainModelBtn');
  if (trainBtn) trainBtn.addEventListener('click', trainAndPredict);
});
