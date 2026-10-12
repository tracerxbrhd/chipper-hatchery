import { api } from 'sdk';

export default async function (message) {
  // This handler only responds to an explicit command in a private bot chat.
  // No notifications, personal-data collection, or gameplay via chat messages.
  if (message.chat?.type !== 'private' || typeof message.text !== 'string') return;
  if (!/^\/(?:start|help)(?:@chipperhatcherybot)?(?:\s|$)/i.test(message.text)) return;
  await api.sendMessage({
    chat_id: message.chat.id,
    text: 'Добро пожаловать в Chipper! Здесь живёт ваш маленький цыплёнок: заботьтесь о нём, собирайте пёрышки и знакомьтесь с новыми птицами. Откройте игру кнопкой «Играть» рядом с полем сообщения или кнопкой ниже.',
    reply_markup: {
      inline_keyboard: [[{ text: 'Открыть Chipper', url: 'https://t.me/chipperhatcherybot?startapp' }]],
    },
  });
}
