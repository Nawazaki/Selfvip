/**
 * Calculate position size based on account balance, risk %, and stop loss points
 */
async function calculatePositionSize() {
  const balance = parseFloat(document.getElementById('accountBalance').value);
  const riskPercent = parseFloat(document.getElementById('riskPercent').value);
  const stopLossPoints = parseFloat(document.getElementById('stopLossPoints').value);
  const riskAmount = balance * (riskPercent / 100);
  // Get current price from live display
  const priceText = document.getElementById('livePriceDisplay').innerText;
  const currentPrice = parseFloat(priceText.split('$')[1]);
  if (isNaN(currentPrice)) {
    alert('Cannot get current price. Load market data first.');
    return;
  }
  // Assume 1 point = 1 unit of currency (simplified). In forex/crypto, you'd need to adjust.
  const pointValue = 1;
  const positionSize = riskAmount / (stopLossPoints * pointValue);
  document.getElementById('positionResult').innerHTML = `
    Suggested position size: ${positionSize.toFixed(4)} units<br>
    Risk amount: $${riskAmount.toFixed(2)}<br>
    Stop loss points: ${stopLossPoints}
  `;
  document.getElementById('positionResult').classList.remove('hidden');
}
