const os = require('os');
const settings = require('../settings.js');

async function pingCommand(sock, chatId, message) {
  try {
    const start = Date.now();

    // 1️⃣ Send initial Ping message
    const sentMsg = await sock.sendMessage(
      chatId,
      { text: '🏓 Pinging...' },
      { quoted: message }
    );

    const end = Date.now();
    const ping = Math.round((end - start) / 2);

    // 2️⃣ Edit the same message to show speed
    await sock.sendMessage(chatId, {
      text: `🥤ᗪ𝗮𝗿𝗸ᑭ𝗮𝘁𝗵 Speed : ${ping} ms 🚀`,
      edit: sentMsg.key
    });

  } catch (error) {
    console.error('Error in ping command:', error);
    await sock.sendMessage(chatId, {
      text: '❌ Failed to measure speed.'
    });
  }
}

module.exports = pingCommand;