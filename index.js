require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const OpenAI = require('openai');

// ---------- Env ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CONTACT_USERNAME = process.env.CONTACT_USERNAME || 'Filolog_N'; // @ belgisiz
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// CHANNELS: "Nomi:@username_yoki_-100ID, Nomi2:@username2, ..."
// Masalan: "Asosiy:@NargizaOlimovna_Onatili,Otzivlar:@Cefr_40_asar"
const CHANNELS = (process.env.CHANNELS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((pair) => {
    const idx = pair.indexOf(':');
    if (idx === -1) return { label: pair, id: pair };
    return { label: pair.slice(0, idx).trim(), id: pair.slice(idx + 1).trim() };
  });

// REVIEW_CHANNELS: bot shu kanal(lar)dagi yangi postlarni kuzatib,
// avtomatik ravishda reklama materiali sifatida admin(lar)ga taklif qiladi.
// Format: @username1,@username2  (bot shu kanallarga ham admin bo'lishi shart)
const REVIEW_CHANNELS = (process.env.REVIEW_CHANNELS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN topilmadi (.env yoki Railway Variables)');
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY topilmadi');
if (CHANNELS.length === 0) throw new Error('CHANNELS topilmadi. Masalan: "Asosiy:@kanal1,Otzivlar:@kanal2"');
if (ADMIN_IDS.length === 0) console.warn('OGOHLANTIRISH: ADMIN_IDS bo\'sh — hech kim botdan foydalana olmaydi.');
if (REVIEW_CHANNELS.length === 0) console.warn('Eslatma: REVIEW_CHANNELS berilmagan — otziv kanallarini avtomatik kuzatish o\'chirilgan.');

const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Har bir admin uchun oxirgi tayyorlangan post (tasdiqlashni kutyapti)
// userId -> { text, photoFileId, selected: Set<number> (CHANNELS indexlari) }
const pendingPosts = new Map();

// Otziv kanalidan kelib, hali ishlatish/rad etish kutilayotgan materiallar
// shortId -> { text, photoFileId, sourceLabel }
const reviewStore = new Map();
let reviewCounter = 0;

function isAdmin(ctx) {
  const id = String(ctx.from?.id || '');
  return ADMIN_IDS.includes(id);
}

function isReviewChannel(chat) {
  const uname = chat.username ? chat.username.toLowerCase() : null;
  const id = String(chat.id);
  return REVIEW_CHANNELS.some((v) => {
    const vv = v.replace(/^@/, '').toLowerCase();
    return vv === uname || v === id;
  });
}

const SYSTEM_PROMPT = `Sen professional marketolog va copywriter'san. Vazifang — o'zbek tilidagi ta'lim kursi (Milliy Sertifikat, Attestatsiya, Ona tili va adabiyot tayyorgarligi) uchun Telegram kanalida e'lon qilinadigan reklama posti yozish.

Qoidalar:
- Faqat o'zbek tilida yoz (lotin alifbosida, admin boshqacha yozmasa).
- Diqqatni tortadigan sarlavha/birinchi qator bilan boshla (lekin haddan tashqari "qichqiriq" yoki yolg'on va'da bo'lmasin).
- Agar berilgan ma'lumotda otziv/natija bo'lsa, qisqa iqtibos sifatida tabiiy kiritib ber.
- Ijtimoiy isbot (boshqalar nima erishgani), aniqlik (qancha o'rin qolgani, muddat) va aniq chaqiriq-harakatga (call to action) e'tibor ber.
- Matn 2-6 ta qisqa paragraf/qatordan oshmasin, Telegram posti uchun mos uzunlikda bo'lsin.
- Oxirida albatta qo'shilish uchun chaqiriq bo'lsin (masalan: pastdagi tugma orqali yozing).
- Haddan tashqari emoji ishlatma — 2-4 tasi yetarli, joyida ishlatilsin.
- O'zingdan raqam yoki fakt o'ylab topma — faqat admin bergan ma'lumotdan foydalan.`;

async function generatePost(userText) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText },
    ],
    temperature: 0.8,
  });
  return completion.choices[0].message.content.trim();
}

function previewKeyboard(selected) {
  const channelRows = CHANNELS.map((ch, i) => [
    Markup.button.callback(
      `${selected.has(i) ? '✅' : '⬜'} ${ch.label}`,
      `toggle_ch_${i}`
    ),
  ]);
  return Markup.inlineKeyboard([
    ...channelRows,
    [Markup.button.callback('📤 Tanlangan kanallarga joylash', 'post_approve')],
    [Markup.button.callback('✏️ Qayta yoz', 'post_regenerate')],
    [Markup.button.callback('❌ Bekor qilish', 'post_cancel')],
  ]);
}

function channelButtonKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('📝 Kursga qo\'shilish', `https://t.me/${CONTACT_USERNAME}`)],
  ]);
}

// ---------- Middleware: faqat adminlar (kanal postlari bundan mustasno) ----------
bot.use((ctx, next) => {
  if (ctx.updateType === 'channel_post' || ctx.updateType === 'edited_channel_post') {
    // Bular pastda alohida, o'z kanal ro'yxati bilan tekshiriladi
    return next();
  }
  if (!ctx.from) return;
  if (!isAdmin(ctx)) {
    // Admin bo'lmagan foydalanuvchilarga jim javob qaytarmaymiz
    return;
  }
  return next();
});

// ---------- Otziv kanallarini kuzatish ----------
bot.on('channel_post', async (ctx) => {
  const post = ctx.channelPost;
  const chat = post.chat;
  if (!isReviewChannel(chat)) return; // faqat REVIEW_CHANNELS'dagi postlarga reaksiya

  const text = post.text || post.caption || '';
  const photoFileId = post.photo ? post.photo[post.photo.length - 1].file_id : null;
  if (!text && !photoFileId) return;

  const sourceLabel = chat.title || chat.username || 'Otziv kanali';
  const id = String(++reviewCounter);
  reviewStore.set(id, { text, photoFileId, sourceLabel });

  const preview = text ? (text.length > 500 ? text.slice(0, 500) + '…' : text) : '(faqat rasm, matnsiz)';
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Shu asosda post yasash', `review_use_${id}`)],
    [Markup.button.callback('❌ E\'tiborsiz qoldirish', `review_ignore_${id}`)],
  ]);

  for (const adminId of ADMIN_IDS) {
    try {
      if (photoFileId) {
        await ctx.telegram.sendPhoto(adminId, photoFileId, {
          caption: `🆕 Yangi otziv (${sourceLabel}):\n\n${preview}`,
          ...kb,
        });
      } else {
        await ctx.telegram.sendMessage(adminId, `🆕 Yangi otziv (${sourceLabel}):\n\n${preview}`, kb);
      }
    } catch (err) {
      console.error('Adminga otziv yuborishda xato:', err);
    }
  }
});

bot.action(/review_use_(\S+)/, async (ctx) => {
  const id = ctx.match[1];
  const review = reviewStore.get(id);
  if (!review) {
    return ctx.answerCbQuery('Bu material eskirgan yoki allaqachon ishlatilgan.', { show_alert: true });
  }
  await ctx.answerCbQuery('Post tayyorlanmoqda...');
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  const briefText = review.text
    ? `Quyidagi otziv/natijaga asoslanib reklama posti yoz:\n\n${review.text}`
    : "Ilova qilingan otziv/natija skrinshotiga asoslanib reklama posti yozib ber.";
  await handleBrief(ctx, briefText, review.photoFileId);
  reviewStore.delete(id);
});

bot.action(/review_ignore_(\S+)/, async (ctx) => {
  const id = ctx.match[1];
  reviewStore.delete(id);
  await ctx.answerCbQuery('E\'tiborsiz qoldirildi.');
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
});

bot.start((ctx) => {
  const list = CHANNELS.map((c) => `• ${c.label}`).join('\n');
  ctx.reply(
    `Salom! Menga reklama qilinadigan kurs haqida qisqa ma'lumot yozing (kurs nomi, necha o'rin qolgani, otziv bo'lsa — matnini ham qo'shing yoki skrinshot rasm bilan birga yuboring).\n\nMen shu asosda tayyor reklama posti yozib, avval sizga ko'rsataman. Keyin qaysi kanal(lar)ga joylashni o'zingiz tanlaysiz:\n${list}`
  );
});

// Matn xabar — brief sifatida qabul qilinadi
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  await handleBrief(ctx, ctx.message.text, null);
});

// Rasm (otziv skrinshoti) + caption
bot.on('photo', async (ctx) => {
  const caption = ctx.message.caption || "Ilova qilingan skrinshot/otzivga asoslanib reklama posti yozib ber.";
  const photoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  await handleBrief(ctx, caption, photoFileId);
});

async function handleBrief(ctx, briefText, photoFileId) {
  const waitMsg = await ctx.reply('✍️ Post tayyorlanmoqda...');
  try {
    const generated = await generatePost(briefText);
    // Standart holatda barcha kanallar tanlangan bo'ladi — kerak bo'lmaganini o'chirib qo'yasiz
    const selected = new Set(CHANNELS.map((_, i) => i));
    pendingPosts.set(ctx.from.id, { text: generated, photoFileId, selected });

    if (photoFileId) {
      await ctx.replyWithPhoto(photoFileId, {
        caption: generated,
        ...previewKeyboard(selected),
      });
    } else {
      await ctx.reply(generated, previewKeyboard(selected));
    }
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi: ' + (err.message || 'noma\'lum xato'));
  } finally {
    await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
  }
}

bot.action(/toggle_ch_(\d+)/, async (ctx) => {
  const pending = pendingPosts.get(ctx.from.id);
  if (!pending) {
    return ctx.answerCbQuery('Tayyor post topilmadi. Avval yangi brief yuboring.');
  }
  const i = Number(ctx.match[1]);
  if (pending.selected.has(i)) {
    pending.selected.delete(i);
  } else {
    pending.selected.add(i);
  }
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup(previewKeyboard(pending.selected).reply_markup).catch(() => {});
});

bot.action('post_approve', async (ctx) => {
  const pending = pendingPosts.get(ctx.from.id);
  if (!pending) {
    return ctx.answerCbQuery('Tayyor post topilmadi. Avval yangi brief yuboring.');
  }
  if (pending.selected.size === 0) {
    return ctx.answerCbQuery('Kamida bitta kanal tanlang.', { show_alert: true });
  }
  const targets = CHANNELS.filter((_, i) => pending.selected.has(i));
  const results = [];
  for (const ch of targets) {
    try {
      if (pending.photoFileId) {
        await ctx.telegram.sendPhoto(ch.id, pending.photoFileId, {
          caption: pending.text,
          ...channelButtonKeyboard(),
        });
      } else {
        await ctx.telegram.sendMessage(ch.id, pending.text, channelButtonKeyboard());
      }
      results.push(`✅ ${ch.label}`);
    } catch (err) {
      console.error(`${ch.label} ga joylashda xato:`, err);
      results.push(`❌ ${ch.label}: ${err.message || 'xato'}`);
    }
  }
  pendingPosts.delete(ctx.from.id);
  await ctx.answerCbQuery('Joylandi!');
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  await ctx.reply(results.join('\n'));
});

bot.action('post_regenerate', async (ctx) => {
  await ctx.answerCbQuery('Qayta yozilmoqda...');
  await ctx.reply("Postni qanday o'zgartiray? (masalan: \"qisqaroq qil\", \"yana otziv qo'sh\", yoki yangi brief yozing)");
});

bot.action('post_cancel', async (ctx) => {
  pendingPosts.delete(ctx.from.id);
  await ctx.answerCbQuery('Bekor qilindi.');
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
});

bot.catch((err, ctx) => {
  console.error('Bot xatosi:', err);
});

bot.launch().then(() => {
  console.log('Marketolog bot ishga tushdi.');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
