function calculatePositionSize() {
  const balance = parseFloat(document.getElementById('accountBalance').value);
  const riskPercent = parseFloat(document.getElementById('riskPercent').value);
  const stopLossPoints = parseFloat(document.getElementById('stopLossPoints').value);
  const riskAmount = balance * (riskPercent / 100);
  // نحتاج إلى سعر الأصل الحالي لتحديد قيمة النقطة
  const currentPrice = parseFloat(document.getElementById('livePriceDisplay').innerText.split('$')[1]);
  if (isNaN(currentPrice)) {
    alert('Cannot get current price. Load market data first.');
    return;
  }
  // بافتراض أن النقطة = 1 دولار للعملات الرقمية، يمكن تعديلها حسب السوق
  const pointValue = 1; // قد تحتاج إلى تعديل حسب الأصل
  const positionSize = riskAmount / (stopLossPoints * pointValue);
  document.getElementById('positionResult').innerHTML = `
    Suggested position size: ${positionSize.toFixed(4)} units<br>
    Risk amount: $${riskAmount.toFixed(2)}<br>
    Stop loss points: ${stopLossPoints}
  `;
  document.getElementById('positionResult').classList.remove('hidden');
}
