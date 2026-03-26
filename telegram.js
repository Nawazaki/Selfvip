/**
 * Send a message to a Telegram chat using a proxy server.
 * The proxy can be a Netlify Function or any other endpoint.
 */
async function sendToTelegram(message) {
  const botToken = localStorage.getItem('telegramBotToken');
  const chatId = localStorage.getItem('telegramChatId');
  if (!botToken || !chatId) {
    alert('Please set Telegram Bot Token and Chat ID in the settings.');
    return;
  }
  // Replace with your own proxy URL (e.g., Netlify function)
  const proxyUrl = 'https://your-proxy-function.netlify.app/send';
  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, chatId, text: message })
    });
    if (response.ok) console.log('Message sent to Telegram');
    else console.error('Failed to send');
  } catch (err) {
    console.error(err);
  }
}
