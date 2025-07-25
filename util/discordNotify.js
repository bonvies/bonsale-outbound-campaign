const { Client, IntentsBitField } = require('discord.js');

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
  ],
});

let isReady = false;

client.once('ready', () => {
  isReady = true;
  console.log(`已登入為 ${client.user.tag}`);
  // 測試訊息可移除
  // sendDiscordMessage('這是一條來自 Discord API 的測試訊息！');
});
const discordBotToken = process.env.DISCORD_BOT_TOKEN;

if (discordBotToken) {
  client.login(discordBotToken); // 請將 token 放到 .env
}

async function sendDiscordMessage(message) {
  try {
    if (!isReady) {
      console.error('Discord Bot 尚未啟動完成');
      return;
    }
    const channelId = process.env.DISCORD_CHANNEL_ID; // 建議也放到 .env
    const channel = await client.channels.fetch(channelId);
    if (channel) {
      await channel.send(message);
    } else {
      console.error('找不到 Discord 頻道');
    }
  } catch (err) {
    console.error('發送 Discord 訊息失敗:', err);
  }
}

module.exports = { sendDiscordMessage };