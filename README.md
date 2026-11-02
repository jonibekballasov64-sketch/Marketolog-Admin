# Marketolog bot

Siz botga qisqa ma'lumot yozasiz (kurs nomi, o'rin soni, otziv matni yoki skrinshoti) — bot OpenAI orqali professional reklama posti yasaydi, avval sizga ko'rsatadi, "✅ Joylash" bossangiz asosiy kanalga (tugma bilan) chiqaradi.

## 1. Bot yaratish
1. Telegram'da @BotFather'ga yozing, `/newbot` bilan bot yarating, tokenni saqlang.
2. Botni **reklama joylanadigan har bir kanalga admin** qilib qo'shing (post yuborish huquqi bilan). Bir nechta kanal bo'lishi mumkin — har safar qaysi kanal(lar)ga joylashni botning o'zida tanlaysiz.

## 2. O'z Telegram ID'ingizni bilish
@userinfobot'ga yozing — u sizning raqamli ID'ingizni beradi. Shuni `ADMIN_IDS` ga qo'yasiz.

## 3. Mahalliy test (ixtiyoriy)
```
cp .env.example .env
# .env faylini to'ldiring
npm install
npm start
```

## 4. Railway'ga joylash
1. Shu papkani GitHub'ga yuklang (yoki Railway CLI bilan to'g'ridan-to'g'ri deploy qiling).
2. Railway'da yangi loyiha → shu repo'ni ulang.
3. **Variables** bo'limida quyidagilarni kiriting:
   - `BOT_TOKEN`
   - `OPENAI_API_KEY`
   - `CHANNELS` (masalan: `Asosiy:@kanal1,Otzivlar:@kanal2`)
   - `CONTACT_USERNAME`
   - `ADMIN_IDS`
4. Deploy tugagach, botga Telegram'da `/start` yozib sinab ko'ring.

## Ishlatish
- Botga shunchaki matn yozing: "Milliy Sertifikat kursi, 5 o'rin qoldi, ... otziv matni ..."
- Yoki otziv skrinshotini caption bilan yuboring.
- Bot tayyor postni ko'rsatadi, har bir kanal oldida belgi bilan (✅/⬜) — kerak bo'lmagan kanalni bosib o'chirib qo'yasiz, standart holatda barchasi tanlangan.
- **📤 Tanlangan kanallarga joylash** bossangiz, faqat belgilangan kanallarga chiqadi (pastida "Kursga qo'shilish" tugmasi bilan, @username'ga olib boradi).
- **✏️ Qayta yoz** — yangi ko'rsatma yozib, qayta so'rang.
- **❌ Bekor qilish** — hech narsa joylanmaydi.
