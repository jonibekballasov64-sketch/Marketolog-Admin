require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const OpenAI = require('openai');

// ---------- Env ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAIN_CHANNEL = process.env.MAIN_CHANNEL; // masalan: @NargizaOlimovna_Onatili yoki -100xxxxxxxxxx
const CONTACT_USERNAME = process.env.CONTACT_USERNAME || 'Filolog_N'; // @ belgisiz
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN topilmadi (.env yoki Railway Variables)');
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY topilmadi');
if (!MAIN_CHANNEL) throw new Error('MAIN_CHANNEL topilmadi');
if (ADMIN_IDS.length === 0) console.warn('OGOHLANTIRISH: ADMIN_IDS bo\'sh — hech kim botdan foydalana olmaydi.');

const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Har bir admin uchun oxirgi tayyorlangan post (tasdiqlashni kutyapti)
const pendingPosts = new Map(); // userId -> { text, photoFileId }

function isAdmin(ctx) {
  const id = String(ctx.from?.id || '');
  return ADMIN_IDS.includes(id);
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

function previewKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Joylash', 'post_approve')],
    [Markup.button.callback('✏️ Qayta yoz', 'post_regenerate')],
    [Markup.button.callback('❌ Bekor qilish', 'post_cancel')],
  ]);
}

function channelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('📝 Kursga qo\'shilish', `https://t.me/${CONTACT_USERNAME}`)],
  ]);
}

// ---------- Middleware: faqat adminlar ----------
bot.use((ctx, next) => {
  if (!ctx.from) return;
  if (!isAdmin(ctx)) {
    // Admin bo'lmagan foydalanuvchilarga jim javob qaytarmaymiz
    return;
  }
  return next();
});

bot.start((ctx) => {
  ctx.reply(
    "Salom! Menga reklama qilinadigan kurs haqida qisqa ma'lumot yozing (kurs nomi, necha o'rin qolgani, otziv bo'lsa — matnini ham qo'shing yoki skrinshot rasm bilan birga yuboring).\n\nMen shu asosda tayyor reklama posti yozib, avval sizga ko'rsataman."
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
    pendingPosts.set(ctx.from.id, { text: generated, photoFileId });

    if (photoFileId) {
      await ctx.replyWithPhoto(photoFileId, {
        caption: generated,
        ...previewKeyboard(),
      });
    } else {
      await ctx.reply(generated, previewKeyboard());
    }
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi: ' + (err.message || 'noma\'lum xato'));
  } finally {
    await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
  }
}

bot.action('post_approve', async (ctx) => {
  const pending = pendingPosts.get(ctx.from.id);
  if (!pending) {
    return ctx.answerCbQuery('Tayyor post topilmadi. Avval yangi brief yuboring.');
  }
  try {
    if (pending.photoFileId) {
      await ctx.telegram.sendPhoto(MAIN_CHANNEL, pending.photoFileId, {
        caption: pending.text,
        ...channelKeyboard(),
      });
    } else {
      await ctx.telegram.sendMessage(MAIN_CHANNEL, pending.text, channelKeyboard());
    }
    pendingPosts.delete(ctx.from.id);
    await ctx.answerCbQuery('✅ Kanalga joylandi!');
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  } catch (err) {
    console.error(err);
    await ctx.answerCbQuery('❌ Joylashda xatolik: ' + (err.message || ''), { show_alert: true });
  }
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
