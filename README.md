# Marketolog bot — postlar kutubxonasi

AI ishlatilmaydi. Siz o'zingiz tayyor postlarni (rasm, video yoki albom + matn) botga saqlab qo'yasiz, keyin kerak paytida kerakli kanal(lar)ga bir tugma bosib yuborasiz. Postlarni istalgan vaqt ko'rish, matnini tahrirlash yoki o'chirish mumkin.

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
1. Shu papkani GitHub'ga yuklang.
2. Railway'da yangi loyiha → shu repo'ni ulang.
3. **Volume** qo'shing va `/data` ga ulang (postlar shu yerda saqlanadi, deploy/restart'dan keyin ham yo'qolmaydi).
4. **Variables** bo'limida quyidagilarni kiriting:
   - `BOT_TOKEN`
   - `CHANNELS` (masalan: `Asosiy:@kanal1,Otzivlar:@kanal2`)
   - `CONTACT_USERNAME`
   - `ADMIN_IDS`
5. Deploy tugagach, botga Telegram'da `/start` yozib sinab ko'ring.

## Ishlatish

### Yangi post qo'shish
1. **➕ Yangi post** tugmasini bosing.
2. Post turini tanlang: rasm+matn, video+matn, albom (10 tagacha rasm)+matn, yoki faqat matn.
3. Post uchun ichki nom bering (bu faqat ro'yxatda ko'rinadi, kanalga chiqmaydi).
4. So'ralgan media(lar)ni yuboring (albom uchun rasmlarni birma-bir yuborib, oxirida `/tayyor` deb yozasiz).
5. Post matnini yuboring — Telegram'ning o'z formatlash vositalaridan (qalin, qiya, iqtibos, havola) bemalol foydalanishingiz mumkin, xuddi shu holicha saqlanadi.
6. Post saqlanadi va sizga ko'rinishi namoyish etiladi.

### Postlarni boshqarish
**📂 Postlarim** orqali saqlangan barcha postlar ro'yxati chiqadi. Birini tanlasangiz:
- **📤 Yuborish** — qaysi kanal(lar)ga joylashni belgilab (✅/⬜), yuborasiz.
- **✏️ Matnni tahrirlash** — faqat matnni yangilaysiz, media o'zgarmaydi.
- **🗑 O'chirish** — tasdiqlagach butunlay o'chiriladi.

Har bir kanalga yuborilgan postda avtomatik "📝 Kursga qo'shilish" tugmasi qo'shiladi (CONTACT_USERNAME'ga olib boradi).

Jarayonni istalgan vaqt `/bekor` buyrug'i bilan to'xtatish mumkin.
