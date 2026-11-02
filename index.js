require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { loadPosts, savePosts, genId } = require('./storage');

// ---------- Env ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const CONTACT_USERNAME = process.env.CONTACT_USERNAME || 'Filolog_N'; // @ belgisiz
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// CHANNELS: "Nomi:@username_yoki_-100ID, Nomi2:@username2, ..."
const CHANNELS = (process.env.CHANNELS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((pair) => {
    const idx = pair.indexOf(':');
    if (idx === -1) return { label: pair, id: pair };
    return { label: pair.slice(0, idx).trim(), id: pair.slice(idx + 1).trim() };
  });

if (!BOT_TOKEN) throw new Error('BOT_TOKEN topilmadi (.env yoki Railway Variables)');
if (CHANNELS.length === 0) throw new Error('CHANNELS topilmadi. Masalan: "Asosiy:@kanal1,Otzivlar:@kanal2"');
if (ADMIN_IDS.length === 0) console.warn('OGOHLANTIRISH: ADMIN_IDS bo\'sh — hech kim botdan foydalana olmaydi.');

const bot = new Telegraf(BOT_TOKEN);

// ---------- Doimiy saqlanadigan postlar ----------
let posts = loadPosts(); // [{ id, title, type, media: [file_id...], text, entities, createdAt }]
function persist() {
  savePosts(posts);
}

// ---------- Vaqtinchalik holat (RAMda, admin boshiga bitta) ----------
// creationState: adminId -> { step, type, title, media: [], editId? }
const creationState = new Map();
// sendState: adminId -> { postId, selected: Set<number> (CHANNELS indexlari) }
const sendState = new Map();

function isAdmin(ctx) {
  const id = String(ctx.from?.id || '');
  return ADMIN_IDS.includes(id);
}

const TYPE_LABELS = {
  photo: '🖼 Rasm + matn',
  video: '🎥 Video + matn',
  album: '🖼🖼 Albom (rasmlar) + matn',
  text: '📝 Faqat matn',
};

// ---------- Klaviaturalar ----------
function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Yangi post', 'new_post')],
    [Markup.button.callback('📂 Postlarim', 'list_posts')],
  ]);
}

function typeSelectKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(TYPE_LABELS.photo, 'type_photo')],
    [Markup.button.callback(TYPE_LABELS.video, 'type_video')],
    [Markup.button.callback(TYPE_LABELS.album, 'type_album')],
    [Markup.button.callback(TYPE_LABELS.text, 'type_text')],
    [Markup.button.callback('❌ Bekor qilish', 'cancel_creation')],
  ]);
}

function postListKeyboard() {
  const rows = posts.map((p) => [Markup.button.callback(`${TYPE_LABELS[p.type].split(' ')[0]} ${p.title}`, `view_${p.id}`)]);
  rows.push([Markup.button.callback('🔙 Menyu', 'menu')]);
  return Markup.inlineKeyboard(rows);
}

function postViewKeyboard(id) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📤 Yuborish', `send_${id}`)],
    [Markup.button.callback('✏️ Matnni tahrirlash', `edit_${id}`)],
    [Markup.button.callback('🗑 O\'chirish', `delete_${id}`)],
    [Markup.button.callback('🔙 Ro\'yxatga', 'list_posts')],
  ]);
}

function deleteConfirmKeyboard(id) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Ha, o\'chirilsin', `delconfirm_${id}`)],
    [Markup.button.callback('🔙 Yo\'q, bekor', `view_${id}`)],
  ]);
}

function sendChannelKeyboard(selected) {
  const rows = CHANNELS.map((ch, i) => [
    Markup.button.callback(`${selected.has(i) ? '✅' : '⬜'} ${ch.label}`, `stoggle_${i}`),
  ]);
  rows.push([Markup.button.callback('📤 Tanlangan kanallarga yuborish', 'sconfirm')]);
  rows.push([Markup.button.callback('❌ Bekor qilish', 'scancel')]);
  return Markup.inlineKeyboard(rows);
}

function channelButtonKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('📝 Kursga qo\'shilish', `https://t.me/${CONTACT_USERNAME}`)],
  ]);
}

// ---------- Postni yuborish (preview yoki kanalga) ----------
async function sendDraftContent(telegram, chatId, draft, extra) {
  if (draft.media && draft.media.length >= 2) {
    await telegram.sendMediaGroup(
      chatId,
      draft.media.map((id) => ({ type: draft.type === 'video' ? 'video' : 'photo', media: id }))
    );
  } else if (draft.media && draft.media.length === 1) {
    if (draft.type === 'video') {
      await telegram.sendVideo(chatId, draft.media[0]);
    } else {
      await telegram.sendPhoto(chatId, draft.media[0]);
    }
  }
  if (draft.text) {
    await telegram.sendMessage(chatId, draft.text, {
      entities: draft.entities && draft.entities.length ? draft.entities : undefined,
      ...extra,
    });
  }
}

// ---------- Middleware: faqat adminlar ----------
bot.use((ctx, next) => {
  if (!ctx.from) return;
  if (!isAdmin(ctx)) return; // admin bo'lmaganlarga jim javob qaytarmaymiz
  return next();
});

bot.start((ctx) => {
  creationState.delete(ctx.from.id);
  sendState.delete(ctx.from.id);
  ctx.reply(
    "Salom! Men siz tayyorlagan postlarni (rasm/video/albom + matn) saqlab, kerak paytida kerakli kanal(lar)ga yuboraman.\n\nQuyidagidan tanlang:",
    mainMenuKeyboard()
  );
});

bot.command('bekor', (ctx) => {
  creationState.delete(ctx.from.id);
  sendState.delete(ctx.from.id);
  ctx.reply('Bekor qilindi.', mainMenuKeyboard());
});

bot.action('menu', async (ctx) => {
  creationState.delete(ctx.from.id);
  sendState.delete(ctx.from.id);
  await ctx.answerCbQuery();
  await ctx.reply('Bosh menyu:', mainMenuKeyboard());
});

// ---------- Yangi post yaratish ----------
bot.action('new_post', async (ctx) => {
  creationState.set(ctx.from.id, { step: 'type' });
  await ctx.answerCbQuery();
  await ctx.reply('Post turini tanlang:', typeSelectKeyboard());
});

bot.action('cancel_creation', async (ctx) => {
  creationState.delete(ctx.from.id);
  await ctx.answerCbQuery('Bekor qilindi.');
  await ctx.reply('Bosh menyu:', mainMenuKeyboard());
});

bot.action(/type_(photo|video|album|text)/, async (ctx) => {
  const type = ctx.match[1];
  creationState.set(ctx.from.id, { step: 'title', type, media: [] });
  await ctx.answerCbQuery();
  await ctx.reply("Post uchun nom bering (faqat o'zingiz uchun ro'yxatda ko'rinadi, kanalga chiqmaydi):");
});

// ---------- Postlar ro'yxati ----------
bot.action('list_posts', async (ctx) => {
  await ctx.answerCbQuery();
  if (posts.length === 0) {
    await ctx.reply("Hali hech qanday post saqlanmagan. \"➕ Yangi post\" orqali qo'shing.", mainMenuKeyboard());
    return;
  }
  await ctx.reply(`Saqlangan postlar (${posts.length} ta):`, postListKeyboard());
});

bot.action(/view_(\S+)/, async (ctx) => {
  const id = ctx.match[1];
  const draft = posts.find((p) => p.id === id);
  await ctx.answerCbQuery();
  if (!draft) {
    return ctx.reply('Bu post topilmadi (o\'chirilgan bo\'lishi mumkin).', mainMenuKeyboard());
  }
  await ctx.reply(`👁 Ko'rinish — ${TYPE_LABELS[draft.type]}\n«${draft.title}»`);
  try {
    await sendDraftContent(ctx.telegram, ctx.chat.id, draft, channelButtonKeyboard());
  } catch (err) {
    console.error('Preview xatosi:', err);
    await ctx.reply('⚠️ Ko\'rsatishda xato: ' + (err.message || ''));
  }
  await ctx.reply('Amal tanlang:', postViewKeyboard(id));
});

bot.action(/delete_(\S+)/, async (ctx) => {
  const id = ctx.match[1];
  const draft = posts.find((p) => p.id === id);
  await ctx.answerCbQuery();
  if (!draft) return ctx.reply('Topilmadi.', mainMenuKeyboard());
  await ctx.reply(`Rostdan ham o'chirilsinmi?\n«${draft.title}»`, deleteConfirmKeyboard(id));
});

bot.action(/delconfirm_(\S+)/, async (ctx) => {
  const id = ctx.match[1];
  posts = posts.filter((p) => p.id !== id);
  persist();
  await ctx.answerCbQuery('O\'chirildi.');
  await ctx.reply('🗑 Post o\'chirildi.', mainMenuKeyboard());
});

// ---------- Matnni tahrirlash ----------
bot.action(/edit_(\S+)/, async (ctx) => {
  const id = ctx.match[1];
  const draft = posts.find((p) => p.id === id);
  await ctx.answerCbQuery();
  if (!draft) return ctx.reply('Topilmadi.', mainMenuKeyboard());
  creationState.set(ctx.from.id, { step: 'edit_caption', editId: id });
  await ctx.reply("Yangi matnni yuboring (eskisi butunlay almashtiriladi):");
});

// ---------- Postni kanal(lar)ga yuborish ----------
bot.action(/send_(\S+)/, async (ctx) => {
  const id = ctx.match[1];
  const draft = posts.find((p) => p.id === id);
  await ctx.answerCbQuery();
  if (!draft) return ctx.reply('Topilmadi.', mainMenuKeyboard());
  const selected = new Set();
  sendState.set(ctx.from.id, { postId: id, selected });
  await ctx.reply(`«${draft.title}» — qaysi kanal(lar)ga yuboramiz?`, sendChannelKeyboard(selected));
});

bot.action(/stoggle_(\d+)/, async (ctx) => {
  const st = sendState.get(ctx.from.id);
  if (!st) return ctx.answerCbQuery('Avval postni tanlang.');
  const i = Number(ctx.match[1]);
  if (st.selected.has(i)) st.selected.delete(i);
  else st.selected.add(i);
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup(sendChannelKeyboard(st.selected).reply_markup).catch(() => {});
});

bot.action('scancel', async (ctx) => {
  sendState.delete(ctx.from.id);
  await ctx.answerCbQuery('Bekor qilindi.');
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
});

bot.action('sconfirm', async (ctx) => {
  const st = sendState.get(ctx.from.id);
  if (!st) return ctx.answerCbQuery('Avval postni tanlang.');
  if (st.selected.size === 0) {
    return ctx.answerCbQuery('Kamida bitta kanal tanlang.', { show_alert: true });
  }
  const draft = posts.find((p) => p.id === st.postId);
  if (!draft) {
    sendState.delete(ctx.from.id);
    return ctx.reply('Bu post endi mavjud emas.', mainMenuKeyboard());
  }
  await ctx.answerCbQuery('Yuborilmoqda...');
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  const targets = CHANNELS.filter((_, i) => st.selected.has(i));
  const results = [];
  for (const ch of targets) {
    try {
      await sendDraftContent(ctx.telegram, ch.id, draft, channelButtonKeyboard());
      results.push(`✅ ${ch.label}`);
    } catch (err) {
      console.error(`${ch.label} ga yuborishda xato:`, err);
      results.push(`❌ ${ch.label}: ${err.message || 'xato'}`);
    }
  }
  sendState.delete(ctx.from.id);
  await ctx.reply(results.join('\n'), mainMenuKeyboard());
});

// ---------- Matn xabarlar: oqim bosqichiga qarab yo'naltiriladi ----------
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return; // buyruqlar alohida ishlanadi

  const state = creationState.get(ctx.from.id);
  if (!state) {
    await ctx.reply("Menyudan foydalaning:", mainMenuKeyboard());
    return;
  }

  if (state.step === 'title') {
    state.title = text.trim().slice(0, 100) || 'Nomsiz post';
    if (state.type === 'text') {
      state.step = 'caption';
      await ctx.reply('Endi post matnini yuboring:');
    } else if (state.type === 'album') {
      state.step = 'album_media';
      await ctx.reply(
        "Rasmlarni birma-bir yuboring (10 tagacha). Tugatgach /tayyor deb yozing."
      );
    } else {
      state.step = 'media';
      await ctx.reply(state.type === 'video' ? 'Videoni yuboring:' : 'Rasmni yuboring:');
    }
    return;
  }

  if (state.step === 'album_media' && text.trim() === '/tayyor') {
    if (!state.media || state.media.length === 0) {
      await ctx.reply("Hali birorta rasm yubormadingiz. Avval kamida bitta rasm yuboring.");
      return;
    }
    state.step = 'caption';
    await ctx.reply(`✅ ${state.media.length} ta rasm qabul qilindi. Endi post matnini yuboring:`);
    return;
  }

  if (state.step === 'caption') {
    const draft = {
      id: genId(),
      title: state.title,
      type: state.type,
      media: state.media || [],
      text,
      entities: ctx.message.entities || [],
      createdAt: new Date().toISOString(),
    };
    posts.push(draft);
    persist();
    creationState.delete(ctx.from.id);
    await ctx.reply(`✅ Post saqlandi: «${draft.title}»`);
    try {
      await sendDraftContent(ctx.telegram, ctx.chat.id, draft, channelButtonKeyboard());
    } catch (err) {
      console.error('Preview xatosi:', err);
    }
    await ctx.reply('Bosh menyu:', mainMenuKeyboard());
    return;
  }

  if (state.step === 'edit_caption') {
    const draft = posts.find((p) => p.id === state.editId);
    creationState.delete(ctx.from.id);
    if (!draft) {
      await ctx.reply('Bu post endi mavjud emas.', mainMenuKeyboard());
      return;
    }
    draft.text = text;
    draft.entities = ctx.message.entities || [];
    persist();
    await ctx.reply(`✅ Matn yangilandi: «${draft.title}»`, mainMenuKeyboard());
    return;
  }

  // Boshqa holatda (masalan 'media' bosqichida matn yuborilsa)
  await ctx.reply("Hozir matn emas, media kutilmoqda. Bekor qilish uchun /bekor yozing.");
});

// ---------- Rasm xabarlar ----------
bot.on('photo', async (ctx) => {
  const state = creationState.get(ctx.from.id);
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  if (!state) {
    await ctx.reply("Bu rasmni qayerga ishlatishni bilmayapman. Avval \"➕ Yangi post\" orqali boshlang.", mainMenuKeyboard());
    return;
  }

  if (state.step === 'media' && state.type === 'photo') {
    state.media = [fileId];
    state.step = 'caption';
    await ctx.reply('✅ Rasm qabul qilindi. Endi post matnini yuboring:');
    return;
  }

  if (state.step === 'album_media') {
    state.media = state.media || [];
    if (state.media.length >= 10) {
      await ctx.reply("Maksimal 10 ta rasm. /tayyor deb yozing.");
      return;
    }
    state.media.push(fileId);
    await ctx.reply(`✅ Qo'shildi (${state.media.length}/10). Yana rasm yuboring yoki /tayyor deb tugating.`);
    return;
  }

  await ctx.reply("Hozir rasm kutilmayapti. Bekor qilish uchun /bekor yozing.");
});

// ---------- Video xabarlar ----------
bot.on('video', async (ctx) => {
  const state = creationState.get(ctx.from.id);
  const fileId = ctx.message.video.file_id;

  if (!state) {
    await ctx.reply("Bu videoni qayerga ishlatishni bilmayapman. Avval \"➕ Yangi post\" orqali boshlang.", mainMenuKeyboard());
    return;
  }

  if (state.step === 'media' && state.type === 'video') {
    state.media = [fileId];
    state.step = 'caption';
    await ctx.reply('✅ Video qabul qilindi. Endi post matnini yuboring:');
    return;
  }

  await ctx.reply("Hozir video kutilmayapti. Bekor qilish uchun /bekor yozing.");
});

bot.catch((err, ctx) => {
  console.error('Bot xatosi:', err);
});

bot.launch().then(() => {
  console.log('Marketolog bot (postlar kutubxonasi) ishga tushdi.');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
