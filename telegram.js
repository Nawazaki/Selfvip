async function sendToTelegram(message) {
  const botToken = localStorage.getItem('telegramBotToken');
  const chatId = localStorage.getItem('telegramChatId');
  if (!botToken || !chatId) {
    alert('Please set Telegram Bot Token and Chat ID in the settings.');
    return;
  }
  // استخدام Netlify Function أو Cloudflare Worker كـ proxy
  const proxyUrl = 'https://your-proxy-function.netlify.app/send'; // استبدل بالرابط الفعلي
  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, chatId, text: message })
    });
    if (response.ok) console.log('Message sent');
    else console.error('Failed to send');
  } catch (err) {
    console.error(err);
  }
}
