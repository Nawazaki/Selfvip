// ========== ML Core ==========
let mlModel = null;
let scalerMin = null, scalerMax = null;

const MODEL_STORAGE_KEY = 'selfvip_cnn_lstm_model';

// --------------------------------------------------------------------
// Data fetching from Binance (crypto only)
// --------------------------------------------------------------------
async function fetchHistoricalData(symbol, interval = '1h', limit = 1000) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Binance API error');
  const data = await response.json();
  return data.map(candle => ({
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5])
  }));
}

/**
 * Build features for training:
 * - Close price
 * - RSI(14)
 * - MACD histogram
 * Also incorporate multi-timeframe (1h and 4h)
 */
async function buildFeatures(symbol, limit = 1000) {
  // Fetch 1h and 4h candles
  const h1Candles = await fetchHistoricalData(symbol, '1h', limit);
  const h4Candles = await fetchHistoricalData(symbol, '4h', Math.ceil(limit / 4) + 5); // enough to align

  // Align data: we need features for each 1h timestamp, but 4h features repeated every 4 hours
  const h1Closes = h1Candles.map(c => c.close);
  const h1RSI = calculateRSI(h1Closes, 14);
  const h1MACD = calculateMACD(h1Closes, 12, 26, 9);

  // Create a map for 4h close (repeated for each 1h in that 4h period)
  const h4CloseMap = [];
  for (let i = 0; i < h4Candles.length; i++) {
    for (let j = 0; j < 4; j++) {
      h4CloseMap.push(h4Candles[i].close);
    }
  }
  // Truncate to same length as h1
  while (h4CloseMap.length > h1Closes.length) h4CloseMap.pop();

  // Build feature matrix: [close, rsi, macd_hist, h4_close]
  const features = [];
  for (let i = 0; i < h1Closes.length; i++) {
    features.push([
      h1Closes[i],
      h1RSI[i] !== undefined ? h1RSI[i] : 50,
      h1MACD.histogram[i] !== undefined ? h1MACD.histogram[i] : 0,
      h4CloseMap[i] !== undefined ? h4CloseMap[i] : h1Closes[i]
    ]);
  }
  return features;
}

/**
 * Normalize features (min-max per feature)
 */
function normalizeFeatures(features) {
  const numFeatures = features[0].length;
  const mins = new Array(numFeatures).fill(Infinity);
  const maxs = new Array(numFeatures).fill(-Infinity);
  for (const row of features) {
    for (let i = 0; i < numFeatures; i++) {
      mins[i] = Math.min(mins[i], row[i]);
      maxs[i] = Math.max(maxs[i], row[i]);
    }
  }
  const normalized = features.map(row => row.map((val, i) => (val - mins[i]) / (maxs[i] - mins[i] || 1)));
  return { normalized, mins, maxs };
}

/**
 * Create sequences and targets (regression: predict next price)
 */
function createSequences(features, seqLength, forecastHorizon = 5) {
  const X = [], y = [];
  for (let i = seqLength; i < features.length - forecastHorizon; i++) {
    X.push(features.slice(i - seqLength, i));
    // Target: close price after forecastHorizon steps (first feature is close)
    y.push(features[i + forecastHorizon][0]);
  }
  return { X, y };
}

/**
 * Build CNN-LSTM model
 */
function buildModel(inputShape) {
  const model = tf.sequential();
  // Conv1D layer
  model.add(tf.layers.conv1d({
    filters: 64,
    kernelSize: 3,
    activation: 'relu',
    inputShape: inputShape
  }));
  model.add(tf.layers.maxPooling1d({ poolSize: 2 }));
  // LSTM layer
  model.add(tf.layers.lstm({ units: 100, returnSequences: false }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 50, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1 })); // regression output
  model.compile({
    optimizer: tf.train.adam(),
    loss: 'meanSquaredError',
    metrics: ['mae']
  });
  return model;
}

/**
 * Save model to localStorage
 */
async function saveModelToLocalStorage() {
  if (!mlModel) {
    console.warn('No model to save');
    return false;
  }
  try {
    await mlModel.save('localstorage://' + MODEL_STORAGE_KEY);
    // Also save scaler
    if (scalerMin !== null && scalerMax !== null) {
      localStorage.setItem(MODEL_STORAGE_KEY + '_scaler', JSON.stringify({ min: scalerMin, max: scalerMax }));
    }
    document.getElementById('modelStatus').innerHTML = '✅ Model saved to browser storage';
    return true;
  } catch (err) {
    console.error('Error saving model:', err);
    document.getElementById('modelStatus').innerHTML = '❌ Failed to save model';
    return false;
  }
}

/**
 * Load model from localStorage
 */
async function loadModelFromLocalStorage() {
  try {
    const model = await tf.loadLayersModel('localstorage://' + MODEL_STORAGE_KEY);
    mlModel = model;
    // Load scaler
    const savedScaler = localStorage.getItem(MODEL_STORAGE_KEY + '_scaler');
    if (savedScaler) {
      const { min, max } = JSON.parse(savedScaler);
      scalerMin = min;
      scalerMax = max;
    }
    document.getElementById('modelStatus').innerHTML = '✅ Model loaded from storage (ready for predictions)';
    return true;
  } catch (err) {
    console.log('No saved model found:', err.message);
    document.getElementById('modelStatus').innerHTML = 'ℹ️ No saved model found. Train a new one.';
    return false;
  }
}

/**
 * Predict using loaded model
 */
async function predictWithLoadedModel() {
  if (!mlModel) {
    alert('No model loaded. Please train or load a model first.');
    return;
  }
  const symbol = document.getElementById('symbolInput').value.toUpperCase();
  const market = document.getElementById('marketType').value;
  if (market !== 'crypto') {
    alert('Prediction currently only supports crypto assets.');
    return;
  }
  const seqLength = parseInt(document.getElementById('mlSeqLength').value);
  const statusDiv = document.getElementById('mlStatus');
  const resultDiv = document.getElementById('mlResult');
  const trainBtn = document.getElementById('trainModelBtn');

  statusDiv.classList.remove('hidden');
  statusDiv.innerText = 'Fetching recent data...';
  resultDiv.classList.add('hidden');
  trainBtn.disabled = true;

  try {
    // Build features for last seqLength candles
    const features = await buildFeatures(symbol, seqLength + 10);
    if (features.length < seqLength) throw new Error('Not enough data for prediction');
    const lastFeatures = features.slice(-seqLength);
    let normalized;
    if (scalerMin !== null && scalerMax !== null) {
      // Use saved scaler
      normalized = lastFeatures.map(row => row.map((val, i) => (val - scalerMin[i]) / (scalerMax[i] - scalerMin[i])));
    } else {
      // Fallback: normalize locally
      const { normalized: norm } = normalizeFeatures(lastFeatures);
      normalized = norm;
    }
    const input = tf.tensor([normalized], [1, seqLength, normalized[0].length], 'float32');
    const pred = mlModel.predict(input);
    const predictedPrice = (await pred.data())[0];
    // De-normalize if possible
    let finalPrice = predictedPrice;
    if (scalerMin !== null && scalerMax !== null) {
      finalPrice = predictedPrice * (scalerMax[0] - scalerMin[0]) + scalerMin[0];
    }
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
      <span class="text-purple-400">Predicted Next Price:</span><br>
      <span class="text-xl font-bold text-emerald-400">$${finalPrice.toFixed(2)}</span><br>
      <span class="text-[10px] text-slate-500">(Based on last ${seqLength} candles)</span>
    `;
    statusDiv.innerText = 'Prediction complete.';
  } catch (err) {
    console.error(err);
    statusDiv.innerText = `Error: ${err.message}`;
    resultDiv.classList.add('hidden');
    resultDiv.innerHTML = `<div class="text-red-400 text-sm">Error: ${err.message}</div>`;
    resultDiv.classList.remove('hidden');
  } finally {
    trainBtn.disabled = false;
  }
}

/**
 * Train the model
 */
async function trainAndPredict() {
  const symbol = document.getElementById('symbolInput').value.toUpperCase();
  const market = document.getElementById('marketType').value;
  if (market !== 'crypto') {
    alert('ML training currently only supports crypto assets.');
    return;
  }

  const candleCount = parseInt(document.getElementById('mlCandlesCount').value);
  const seqLength = parseInt(document.getElementById('mlSeqLength').value);
  const epochs = parseInt(document.getElementById('mlEpochs').value);

  const statusDiv = document.getElementById('mlStatus');
  const resultDiv = document.getElementById('mlResult');
  const trainBtn = document.getElementById('trainModelBtn');
  const progressContainer = document.getElementById('progressBarContainer');
  const progressBar = document.getElementById('progressBar');

  trainBtn.disabled = true;
  trainBtn.innerText = '⏳ Fetching data...';
  statusDiv.classList.remove('hidden');
  statusDiv.innerText = 'Fetching historical data...';
  resultDiv.classList.add('hidden');
  progressContainer.classList.add('hidden');

  try {
    // Build features
    const features = await buildFeatures(symbol, candleCount);
    if (features.length < seqLength + 10) throw new Error('Not enough data');
    // Normalize
    const { normalized, mins, maxs } = normalizeFeatures(features);
    scalerMin = mins;
    scalerMax = maxs;
    // Create sequences
    const { X, y } = createSequences(normalized, seqLength, 5);
    if (X.length === 0) throw new Error('Cannot create sequences');

    // Split train/val (80/20)
    const splitIndex = Math.floor(X.length * 0.8);
    const X_train = X.slice(0, splitIndex);
    const y_train = y.slice(0, splitIndex);
    const X_val = X.slice(splitIndex);
    const y_val = y.slice(splitIndex);

    const trainX = tf.tensor(X_train, [X_train.length, seqLength, X_train[0].length], 'float32');
    const trainY = tf.tensor(y_train, [y_train.length, 1], 'float32');
    const valX = tf.tensor(X_val, [X_val.length, seqLength, X_val[0].length], 'float32');
    const valY = tf.tensor(y_val, [y_val.length, 1], 'float32');

    statusDiv.innerText = 'Building CNN-LSTM model...';
    mlModel = buildModel([seqLength, X_train[0].length]);

    statusDiv.innerText = `Training for ${epochs} epochs...`;
    trainBtn.innerText = '🧠 Training...';
    progressContainer.classList.remove('hidden');

    const history = await mlModel.fit(trainX, trainY, {
      epochs: epochs,
      validationData: [valX, valY],
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          const percent = ((epoch + 1) / epochs) * 100;
          progressBar.style.width = `${percent}%`;
          statusDiv.innerText = `Epoch ${epoch+1}/${epochs} - loss: ${logs.loss.toFixed(4)} - mae: ${logs.mae.toFixed(4)} - val_mae: ${logs.val_mae.toFixed(4)}`;
        }
      }
    });

    // Save model after training
    await saveModelToLocalStorage();

    // Predict next price
    const lastFeatures = normalized.slice(-seqLength);
    const input = tf.tensor([lastFeatures], [1, seqLength, lastFeatures[0].length], 'float32');
    const pred = mlModel.predict(input);
    const predictedPriceNorm = (await pred.data())[0];
    const predictedPrice = predictedPriceNorm * (maxs[0] - mins[0]) + mins[0];

    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
      <span class="text-purple-400">Training Complete. Predicted Next Price:</span><br>
      <span class="text-xl font-bold text-emerald-400">$${predictedPrice.toFixed(2)}</span><br>
      <span class="text-[10px] text-slate-500">(Based on last ${seqLength} candles)</span>
    `;
    const finalValMAE = history.history.val_mae[history.history.val_mae.length-1];
    statusDiv.innerText = `Training complete. Validation MAE: ${finalValMAE.toFixed(4)}`;
  } catch (err) {
    console.error(err);
    statusDiv.innerText = `Error: ${err.message}`;
    resultDiv.classList.add('hidden');
    resultDiv.innerHTML = `<div class="text-red-400 text-sm">Error: ${err.message}</div>`;
    resultDiv.classList.remove('hidden');
  } finally {
    trainBtn.disabled = false;
    trainBtn.innerText = '🧠 Start Training';
  }
}

// Expose global functions
window.mlModel = mlModel;
window.scalerMin = scalerMin;
window.scalerMax = scalerMax;
window.saveModelToLocalStorage = saveModelToLocalStorage;
window.loadModelFromLocalStorage = loadModelFromLocalStorage;
window.predictWithLoadedModel = predictWithLoadedModel;
window.trainAndPredict = trainAndPredict;
window.fetchHistoricalData = fetchHistoricalData;
window.buildFeatures = buildFeatures;
window.normalizeFeatures = normalizeFeatures;
window.createSequences = createSequences;

// Attach event listeners after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const trainBtn = document.getElementById('trainModelBtn');
  if (trainBtn) trainBtn.addEventListener('click', trainAndPredict);
  const saveBtn = document.getElementById('saveModelBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveModelToLocalStorage);
  const loadBtn = document.getElementById('loadModelBtn');
  if (loadBtn) loadBtn.addEventListener('click', loadModelFromLocalStorage);
  const predictBtn = document.getElementById('predictWithModelBtn');
  if (predictBtn) predictBtn.addEventListener('click', predictWithLoadedModel);
  const backtestBtn = document.getElementById('runBacktestBtn');
  if (backtestBtn) backtestBtn.addEventListener('click', runBacktest);
  const calcPosBtn = document.getElementById('calcPositionBtn');
  if (calcPosBtn) calcPosBtn.addEventListener('click', calculatePositionSize);
  // Attempt to load saved model on startup
  loadModelFromLocalStorage();
});
