// Postlarni doimiy saqlash — Railway'dagi /data volume'iga JSON fayl sifatida yoziladi,
// shuning uchun bot qayta ishga tushganda (deploy, restart) ma'lumot yo'qolmaydi.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const DATA_FILE = path.join(DATA_DIR, 'posts.json');

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    // allaqachon mavjud bo'lishi mumkin — e'tiborsiz qoldiramiz
  }
}

function loadPosts() {
  ensureDir();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function savePosts(posts) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2), 'utf8');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = { loadPosts, savePosts, genId };
