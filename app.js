import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile as updateAuthProfile } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, doc, query, where, limit, orderBy, getDoc, getDocs, setDoc, updateDoc, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvb-FYk1-osvvQtFwuv8kPPRBgBJJU9EQ",
  authDomain: "luna-a9fa5.firebaseapp.com",
  projectId: "luna-a9fa5",
  storageBucket: "luna-a9fa5.firebasestorage.app",
  messagingSenderId: "168033013342",
  appId: "1:168033013342:web:d2d948a3bd93f5cbd6eecf",
  measurementId: "G-06FRESS07P"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const state = { user: null, profile: null, mode: "login", photo: "", chatUid: null, chatName: "", stopMessages: null, toastTimer: null, month: new Date(), period: "", pet: { food: 70, happy: 70, energy: 70 } };

function tell(message, kind = "") {
  const el = $("toast");
  el.textContent = message;
  el.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
}
function feedback(id, message, kind = "") {
  const el = $(id);
  el.textContent = message || "";
  el.className = "feedback" + (kind ? " " + kind : "");
}
function errorMessage(error, operation = "read") {
  console.error("LUNA Firebase operation failed", operation, error?.code || "unknown");
  const code = error?.code || "";
  if (code.includes("permission-denied")) return "Firestore отклонил действие. Правила базы или состояние аккаунта не разрешают эту операцию.";
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) return "Нет связи с Firebase. Проверь интернет и попробуй ещё раз.";
  if (code.includes("already-exists") || code.includes("nickname-taken")) return "Этот никнейм уже занят. Выбери другой.";
  if (code.includes("not-found")) return "Запись не найдена. Обнови страницу и повтори действие.";
  if (code.includes("unauthenticated")) return "Сессия завершилась. Войди в аккаунт ещё раз.";
  if (code.includes("failed-precondition")) return "База пока не готова для этого действия. Обнови страницу чуть позже.";
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password") || code.includes("auth/user-not-found")) return "Не удалось войти: проверь почту и пароль.";
  if (code.includes("auth/email-already-in-use")) return "Аккаунт с этой почтой уже существует. Попробуй войти.";
  if (code.includes("auth/weak-password")) return "Пароль должен содержать не меньше 6 символов.";
  if (code.includes("auth/invalid-email")) return "Проверь адрес электронной почты.";
  if (code.includes("auth/too-many-requests")) return "Слишком много попыток. Подожди немного и попробуй снова.";
  if (code.startsWith("auth/")) return "Не удалось выполнить вход. Проверь подключение и данные аккаунта.";
  return operation === "write" ? "Не удалось сохранить изменения. Попробуй ещё раз." : "Не удалось загрузить данные. Попробуй ещё раз.";
}
function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) { button.dataset.oldText = button.textContent; button.disabled = true; button.textContent = text || "Подожди…"; }
  else { button.disabled = false; if (button.dataset.oldText) button.textContent = button.dataset.oldText; }
}
function page(name) {
  document.querySelectorAll(".page").forEach((el) => { el.classList.toggle("active", el.id === name); });
  document.querySelectorAll(".bottom-nav [data-page]").forEach((el) => { el.classList.toggle("active", el.dataset.page === name); });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll("[data-page]").forEach((el) => el.addEventListener("click", (event) => {
  event.preventDefault();
  page(el.dataset.page);
}));
function normalizeNick(value) { return String(value || "").trim().replace(/^@/, "").normalize("NFKC").toLocaleLowerCase("ru-RU"); }
function validNick(value) { const v = String(value || "").trim(); return v.length >= 2 && v.length <= 40 && !/[\/\\]/.test(v); }
function pairId(a, b) { return [a, b].sort().join("~"); }
function profileRef(uid) { return doc(db, "lunaProfiles", uid); }
function usernameRef(nickLower) { return doc(db, "lunaUsernames", nickLower); }
function safeText(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function setAuthMode(mode) {
  state.mode = mode;
  $("loginMode").classList.toggle("selected", mode === "login");
  $("signupMode").classList.toggle("selected", mode === "signup");
  $("signupNickWrap").classList.toggle("hidden", mode !== "signup");
  $("authSubmit").textContent = mode === "login" ? "Войти" : "Создать аккаунт";
  $("authPassword").autocomplete = mode === "login" ? "current-password" : "new-password";
}
$("loginMode").addEventListener("click", () => setAuthMode("login"));
$("signupMode").addEventListener("click", () => setAuthMode("signup"));
$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("authSubmit");
  setBusy(button, true, "Подключаемся…");
  try {
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if (state.mode === "signup") {
      const nick = $("signupNick").value.trim();
      if (!validNick(nick)) throw Object.assign(new Error("invalid-nickname"), { code: "luna/invalid-nickname" });
      await createUserWithEmailAndPassword(auth, email, password);
      tell("Аккаунт создан. Теперь сохрани никнейм в профиле.");
      page("profile");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      tell("Ты вошла в LUNA.");
    }
  } catch (error) {
    if (error.code === "luna/invalid-nickname") tell("Никнейм должен содержать от 2 до 40 символов и не содержать /.");
    else tell(errorMessage(error, "auth"));
  } finally { setBusy(button, false); }
});
$("resetPassword").addEventListener("click", async () => {
  const email = $("authEmail").value.trim();
  if (!email) { tell("Сначала введи свою электронную почту."); $("authEmail").focus(); return; }
  try { await sendPasswordResetEmail(auth, email); tell("Если аккаунт с этой почтой существует, письмо для сброса отправлено."); }
  catch (error) { tell(errorMessage(error, "auth")); }
});
$("signOut").addEventListener("click", async () => {
  try { if (state.stopMessages) state.stopMessages(); state.stopMessages = null; await signOut(auth); tell("Ты вышла из аккаунта."); }
  catch (error) { tell(errorMessage(error, "auth")); }
});
function renderPhoto() {
  const el = $("photoPreview");
  el.style.backgroundImage = state.photo ? "url('" + state.photo.replace(/['()\\]/g, "") + "')" : "";
  el.textContent = state.photo ? "" : "✦";
}
async function compressPhoto(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Выбери изображение.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Изображение должно быть меньше 8 МБ.");
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 480 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas.toDataURL("image/jpeg", 0.76);
}
$("photoInput").addEventListener("change", async () => {
  try { state.photo = await compressPhoto($("photoInput").files[0]); renderPhoto(); }
  catch (error) { tell(error.message || "Не удалось обработать фото."); }
});
$("removePhoto").addEventListener("click", () => { state.photo = ""; $("photoInput").value = ""; renderPhoto(); });
function fillProfile(profile = {}) {
  state.profile = profile;
  $("nick").value = profile.nick || "";
  $("bio").value = profile.bio || "";
  $("interests").value = profile.interests || "";
  $("favorites").value = profile.favorites || "";
  $("mood").value = profile.mood || "";
  state.photo = profile.photo || "";
  $("profileEmail").textContent = state.user?.email || "";
  $("accountLabel").textContent = profile.nick ? "@" + profile.nick : (state.user?.email || "Гость");
  renderPhoto();
}
async function loadProfile(user) {
  $("authPanel").classList.toggle("hidden", !!user);
  $("profilePanel").classList.toggle("hidden", !user);
  if (!user) {
    state.profile = null;
    state.photo = "";
    $("accountLabel").textContent = "Гость";
    $("requestsList").textContent = "Войди в аккаунт, чтобы посмотреть заявки.";
    $("friendsList").textContent = "Войди в аккаунт, чтобы увидеть подруг.";
    feedback("searchResult", "Войди в аккаунт в разделе «Профиль», чтобы искать.");
    closeChat();
    return;
  }
  $("profileEmail").textContent = user.email || "";
  try {
    const snap = await getDoc(profileRef(user.uid));
    fillProfile(snap.exists() ? snap.data() : { nick: user.displayName || "" });
    await refreshSocial();
  } catch (error) {
    fillProfile({ nick: user.displayName || "" });
    tell(errorMessage(error, "read"));
  }
}
function profileData() {
  const nick = $("nick").value.trim();
  return {
    uid: state.user.uid, nick, nickLower: normalizeNick(nick),
    bio: $("bio").value.trim(), interests: $("interests").value.trim(),
    favorites: $("favorites").value.trim(), photo: state.photo,
    mood: $("mood").value || "", updatedAt: serverTimestamp()
  };
}
$("profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.user) { tell("Войди в аккаунт, чтобы сохранить профиль."); return; }
  const button = $("saveProfile");
  setBusy(button, true, "Сохраняем…");
  try {
    const data = profileData();
    if (!validNick(data.nick) || data.nickLower.includes("/")) throw Object.assign(new Error("invalid-nickname"), { code: "luna/invalid-nickname" });
    const pRef = profileRef(state.user.uid);
    const nextRef = usernameRef(data.nickLower);
    await runTransaction(db, async (tx) => {
      const oldSnap = await tx.get(pRef);
      const oldData = oldSnap.exists() ? oldSnap.data() : null;
      const oldRef = oldData?.nickLower && oldData.nickLower !== data.nickLower ? usernameRef(oldData.nickLower) : null;
      const nextSnap = await tx.get(nextRef);
      const oldUsernameSnap = oldRef ? await tx.get(oldRef) : null;
      if (nextSnap.exists() && nextSnap.data().uid !== state.user.uid) throw Object.assign(new Error("taken"), { code: "luna/nickname-taken" });
      tx.set(nextRef, { uid: state.user.uid, nick: data.nick, nickLower: data.nickLower, updatedAt: serverTimestamp() });
      if (oldUsernameSnap?.exists() && oldUsernameSnap.data().uid === state.user.uid) tx.delete(oldRef);
      tx.set(pRef, data);
    });
    try { await updateAuthProfile(state.user, { displayName: data.nick }); } catch (_) {}
    fillProfile({ ...data, updatedAt: null });
    feedback("searchResult", "");
    tell("Профиль сохранён.");
  } catch (error) {
    if (error.code === "luna/invalid-nickname") tell("Никнейм должен содержать от 2 до 40 символов и не содержать /.");
    else tell(errorMessage(error, "write"));
  } finally { setBusy(button, false); }
});
function showSearchCard(nick, uid, nickLower) {
  $("searchResult").innerHTML = '<div class="item-card"><strong>' + safeText(nick) + '</strong><div class="meta">УЧАСТНИЦА LUNA</div><div class="item-actions"><button class="small-button primary" type="button" data-add-uid="' + safeText(uid) + '" data-add-nick="' + safeText(nick) + '" data-add-lower="' + safeText(nickLower) + '">＋ Добавить в подруги</button></div></div>';
}
$("searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const raw = $("friendSearch").value.trim();
  const nickLower = normalizeNick(raw);
  if (!state.user) { feedback("searchResult", "Войди в аккаунт в разделе «Профиль», чтобы искать.", "error"); return; }
  if (!validNick(raw)) { feedback("searchResult", "Введи точный никнейм длиной от 2 до 40 символов."); return; }
  const button = $("searchButton");
  setBusy(button, true, "Ищем…");
  feedback("searchResult", "Ищем @" + raw + "…");
  try {
    const snap = await getDoc(usernameRef(nickLower));
    if (!snap.exists()) { feedback("searchResult", "Никнейм «" + raw + "» не найден. Проверь написание или попроси подругу сохранить профиль."); return; }
    const account = snap.data();
    if (!account.uid || account.uid === state.user.uid) { feedback("searchResult", account.uid === state.user.uid ? "Это твой никнейм 🙂" : "Профиль ещё настраивается."); return; }
    const existing = await getDocs(query(collection(db, "lunaFriends"), where("members", "array-contains", state.user.uid), limit(200)));
    const alreadyFriends = existing.docs.some((friend) => friend.id === pairId(state.user.uid, account.uid));
    if (alreadyFriends) { feedback("searchResult", account.nick + " уже у тебя в подругах 💗"); return; }
    showSearchCard(account.nick || raw, account.uid, nickLower);
  } catch (error) { feedback("searchResult", errorMessage(error, "read"), "error"); }
  finally { setBusy(button, false); }
});
async function sendRequest(uid, nick, nickLower, button) {
  if (!state.user || uid === state.user.uid) return;
  setBusy(button, true, "Отправляем…");
  try {
    const friends = await getDocs(query(collection(db, "lunaFriends"), where("members", "array-contains", state.user.uid), limit(200)));
    if (friends.docs.some((friend) => friend.id === pairId(state.user.uid, uid))) { feedback("searchResult", "Вы уже подруги 💗"); return; }
    const [profileSnap, usernameSnap] = await Promise.all([getDoc(profileRef(state.user.uid)), getDoc(usernameRef(nickLower))]);
    if (!profileSnap.exists() || !profileSnap.data().nick) { feedback("searchResult", "Сначала сохрани свой профиль и никнейм."); return; }
    if (!usernameSnap.exists() || usernameSnap.data().uid !== uid) { feedback("searchResult", "Никнейм изменился. Найди подругу ещё раз."); return; }
    const outgoing = await getDocs(query(collection(db, "lunaFriendRequests"), where("fromUid", "==", state.user.uid), where("toUid", "==", uid), limit(1)));
    const incoming = await getDocs(query(collection(db, "lunaFriendRequests"), where("toUid", "==", state.user.uid), where("fromUid", "==", uid), limit(1)));
    const own = outgoing.docs[0] || null;
    const reverse = incoming.docs[0] || null;
    if (own?.data().status === "pending") { feedback("searchResult", "Заявка уже отправлена 💌"); return; }
    if (reverse?.data().status === "pending") { feedback("searchResult", "Эта участница уже отправила тебе заявку. Открой список заявок и прими её."); await refreshSocial(); return; }
    const requestRef = doc(db, "lunaFriendRequests", state.user.uid + "~" + uid);
    const data = { fromUid: state.user.uid, toUid: uid, fromNick: profileSnap.data().nick, toNick: usernameSnap.data().nick, toNickLower: nickLower, status: "pending" };
    if (own?.data().status === "declined") {
      await updateDoc(requestRef, { fromNick: data.fromNick, toNick: data.toNick, toNickLower: data.toNickLower, status: "pending" });
    } else if (own?.data().status === "accepted") {
      feedback("searchResult", "Заявка уже принята. Обнови список подруг."); return;
    } else {
      await setDoc(requestRef, { ...data, createdAt: serverTimestamp() });
    }
    feedback("searchResult", "Заявка отправлена 💌", "success");
  } catch (error) { feedback("searchResult", errorMessage(error, "write"), "error"); }
  finally { setBusy(button, false); }
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-uid]");
  if (button) sendRequest(button.dataset.addUid, button.dataset.addNick, button.dataset.addLower, button);
});
$("refreshSocial").addEventListener("click", refreshSocial);
async function refreshSocial() {
  if (!state.user) return;
  try {
    const incoming = await getDocs(query(collection(db, "lunaFriendRequests"), where("toUid", "==", state.user.uid), limit(100)));
    const requests = incoming.docs.filter((snap) => snap.data().status === "pending");
    $("requestsList").innerHTML = requests.length ? requests.map((snap) => {
      const item = snap.data();
      return '<article class="item-card"><div class="meta">ЗАПРОС В ПОДРУГИ</div><strong>' + safeText(item.fromNick || "Участница LUNA") + '</strong><div class="item-actions"><button type="button" class="small-button primary" data-request-action="accept" data-request-id="' + safeText(snap.id) + '">Принять</button><button type="button" class="small-button" data-request-action="decline" data-request-id="' + safeText(snap.id) + '">Отклонить</button></div></article>';
    }).join("") : '<div class="empty-state">Новых заявок пока нет.</div>';
    const friends = await getDocs(query(collection(db, "lunaFriends"), where("members", "array-contains", state.user.uid), limit(100)));
    const ids = [];
    friends.docs.forEach((snap) => (snap.data().members || []).forEach((uid) => { if (uid !== state.user.uid && !ids.includes(uid)) ids.push(uid); }));
    const profiles = await Promise.all(ids.map((uid) => getDoc(profileRef(uid))));
    const visible = profiles.filter((snap) => snap.exists());
    $("friendsList").innerHTML = visible.length ? visible.map((snap) => {
      const item = snap.data();
      return '<article class="item-card"><strong>' + safeText(item.nick || "Подруга") + '</strong><p>' + safeText(item.interests || item.bio || "Участница LUNA") + '</p><div class="item-actions"><button type="button" class="small-button primary" data-chat-uid="' + safeText(item.uid || snap.id) + '" data-chat-name="' + safeText(item.nick || "Подруга") + '">Открыть чат</button></div></article>';
    }).join("") : '<div class="empty-state">Пока никого нет — найди подругу по никнейму выше.</div>';
  } catch (error) {
    $("requestsList").textContent = errorMessage(error, "read");
    $("friendsList").textContent = errorMessage(error, "read");
  }
}
document.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-request-action]");
  if (action) await respondRequest(action.dataset.requestId, action.dataset.requestAction === "accept");
  const friend = event.target.closest("[data-chat-uid]");
  if (friend) openChat(friend.dataset.chatUid, friend.dataset.chatName);
});
async function respondRequest(id, accept) {
  if (!state.user) return;
  try {
    const ref = doc(db, "lunaFriendRequests", id);
    const [friendQuery] = await Promise.all([
      getDocs(query(collection(db, "lunaFriends"), where("members", "array-contains", state.user.uid), limit(200)))
    ]);
    const alreadyFriends = friendQuery.docs.some((snap) => snap.id === id.replace(state.user.uid + "~", "").replace("~" + state.user.uid, ""));
    await runTransaction(db, async (tx) => {
      const requestSnap = await tx.get(ref);
      if (!requestSnap.exists() || requestSnap.data().toUid !== state.user.uid || requestSnap.data().status !== "pending") throw Object.assign(new Error("stale"), { code: "luna/request-stale" });
      const item = requestSnap.data();
      if (!accept) { tx.update(ref, { status: "declined" }); return; }
      const members = [item.fromUid, item.toUid].sort();
      const friendshipRef = doc(db, "lunaFriends", pairId(item.fromUid, item.toUid));
      tx.update(ref, { status: "accepted" });
      if (!alreadyFriends) tx.set(friendshipRef, { members, requestId: id, createdAt: serverTimestamp() });
    });
    await refreshSocial();
    tell(accept ? "Вы теперь подруги 💗" : "Заявка отклонена.");
  } catch (error) { tell(errorMessage(error, "write")); await refreshSocial(); }
}
function closeChat() {
  if (state.stopMessages) state.stopMessages();
  state.stopMessages = null;
  state.chatUid = null;
  $("chatPanel").classList.add("hidden");
  $("chatEmpty").classList.remove("hidden");
  $("chatEmpty").textContent = state.user ? "Выбери подтверждённую подругу, чтобы открыть чат." : "Войди в аккаунт, чтобы открыть личный чат.";
  $("chatTitle").textContent = "Личный чат";
}
async function openChat(uid, name) {
  closeChat();
  if (!state.user) return;
  state.chatUid = uid;
  $("chatTitle").textContent = "Чат с " + name;
  $("chatEmpty").textContent = "Загружаем чат…";
  try {
    const friend = await getDoc(doc(db, "lunaFriends", pairId(state.user.uid, uid)));
    if (!friend.exists() || !friend.data().members?.includes(state.user.uid)) { $("chatEmpty").textContent = "Чат доступен только после подтверждения дружбы."; return; }
    await setDoc(doc(db, "lunaChats", pairId(state.user.uid, uid)), { members: [state.user.uid, uid].sort(), updatedAt: serverTimestamp() }, { merge: true });
    $("chatEmpty").classList.add("hidden");
    $("chatPanel").classList.remove("hidden");
    const messages = query(collection(db, "lunaChats", pairId(state.user.uid, uid), "messages"), orderBy("createdAt", "asc"), limit(100));
    state.stopMessages = onSnapshot(messages, (snap) => {
      $("messages").innerHTML = snap.docs.map((message) => {
        const item = message.data();
        const time = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
        return '<div class="bubble ' + (item.fromUid === state.user.uid ? "mine" : "") + '">' + safeText(item.text) + '<time>' + safeText(time) + '</time></div>';
      }).join("") || '<div class="empty-state">Напиши первое сообщение ✨</div>';
      $("messages").scrollTop = $("messages").scrollHeight;
    }, (error) => { $("messages").textContent = errorMessage(error, "read"); });
  } catch (error) { $("chatEmpty").textContent = errorMessage(error, "read"); }
}
$("messageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("messageInput").value.trim();
  if (!state.user || !state.chatUid || !text) return;
  const button = $("sendMessage");
  setBusy(button, true, "Отправляем…");
  try {
    const id = pairId(state.user.uid, state.chatUid);
    await setDoc(doc(collection(db, "lunaChats", id, "messages")), { fromUid: state.user.uid, text, createdAt: serverTimestamp() });
    $("messageInput").value = "";
  } catch (error) { tell(errorMessage(error, "write")); }
  finally { setBusy(button, false); }
});
const cards = [
  ["Звезда", "Что помогает тебе снова замечать возможности?", "✧"],
  ["Императрица", "Где тебе сейчас нужно больше заботы и нежности?", "♛"],
  ["Луна", "Какое чувство просит, чтобы его выслушали?", "☾"],
  ["Сила", "Как поддержать себя без лишнего давления?", "♌"],
  ["Солнце", "Что сегодня может сделать день немного светлее?", "☼"],
  ["Отшельник", "Какой ответ ты уже почти знаешь?", "♧"]
];
$("drawCard").addEventListener("click", () => {
  const card = cards[Math.floor(Math.random() * cards.length)];
  $("cardName").textContent = card[0];
  $("cardSymbol").textContent = card[2];
  $("cardMeaning").innerHTML = "<strong>" + safeText(card[0]) + "</strong><p>" + safeText(card[1]) + "</p><small>Запиши, что этот вопрос значит лично для тебя.</small>";
});
function notesKey() { return "luna_notes_v2_" + (state.user?.uid || "guest"); }
function loadNotes() {
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem(notesKey()) || "[]"); } catch (_) {}
  $("notesList").innerHTML = notes.length ? notes.map((note, index) => '<article class="item-card"><div class="meta">' + safeText(note.topic) + '</div><strong>' + safeText(note.title) + '</strong><p>' + safeText(note.body) + '</p><button class="small-button danger" type="button" data-delete-note="' + index + '">Удалить</button></article>').join("") : '<div class="empty-state">Здесь пока пусто. Можно начать с одной мысли.</div>';
}
$("noteForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("noteTitle").value.trim();
  if (!title) { tell("Добавь заголовок заметки."); return; }
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem(notesKey()) || "[]"); } catch (_) {}
  notes.unshift({ title, topic: $("noteTopic").value, body: $("noteBody").value.trim(), date: Date.now() });
  localStorage.setItem(notesKey(), JSON.stringify(notes.slice(0, 100)));
  $("noteTitle").value = ""; $("noteBody").value = "";
  loadNotes(); tell("Заметка сохранена в этом браузере.");
});
document.addEventListener("click", (event) => {
  const del = event.target.closest("[data-delete-note]");
  if (!del) return;
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem(notesKey()) || "[]"); } catch (_) {}
  notes.splice(Number(del.dataset.deleteNote), 1);
  localStorage.setItem(notesKey(), JSON.stringify(notes));
  loadNotes();
});
const pad2 = (n) => String(n).padStart(2, "0");
function dateKey(date) { return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()); }
function loadPeriod() {
  try { state.period = localStorage.getItem("luna_period_v2") || ""; } catch (_) { state.period = ""; }
  $("periodDate").value = state.period;
  if (state.period) feedback("periodMessage", "Сохранено: " + new Date(state.period + "T12:00:00").toLocaleDateString("ru-RU"));
  renderCalendar();
}
$("savePeriod").addEventListener("click", () => {
  state.period = $("periodDate").value;
  if (!state.period) { feedback("periodMessage", "Сначала выбери дату."); return; }
  localStorage.setItem("luna_period_v2", state.period);
  feedback("periodMessage", "Дата сохранена только в этом браузере.", "success");
  renderCalendar();
});
$("prevMonth").addEventListener("click", () => { state.month.setMonth(state.month.getMonth() - 1); renderCalendar(); });
$("nextMonth").addEventListener("click", () => { state.month.setMonth(state.month.getMonth() + 1); renderCalendar(); });
function renderCalendar() {
  const year = state.month.getFullYear(), month = state.month.getMonth();
  $("calendarMonth").textContent = new Date(year, month, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const labels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  let html = labels.map((label) => '<div class="calendar-cell label" role="columnheader">' + label + '</div>').join("");
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < first; i++) html += '<div class="calendar-cell" aria-hidden="true"></div>';
  for (let day = 1; day <= count; day++) {
    const value = dateKey(new Date(year, month, day));
    const classes = ["calendar-cell"];
    if (value === dateKey(new Date())) classes.push("today");
    if (state.period && value >= state.period && value < dateKey(new Date(new Date(state.period + "T12:00:00").getTime() + 5 * 86400000))) classes.push("period");
    html += '<div class="' + classes.join(" ") + '" role="gridcell">' + day + '</div>';
  }
  $("calendar").innerHTML = html;
}
function loadPet() {
  try { state.pet = { ...state.pet, ...JSON.parse(localStorage.getItem("luna_pet_v2") || "{}") }; } catch (_) {}
  paintPet();
}
function paintPet() {
  $("foodValue").textContent = state.pet.food; $("happyValue").textContent = state.pet.happy; $("energyValue").textContent = state.pet.energy;
}
document.querySelectorAll("[data-pet]").forEach((button) => button.addEventListener("click", () => {
  const p = state.pet;
  if (button.dataset.pet === "feed") { p.food = Math.min(100, p.food + 18); p.happy = Math.min(100, p.happy + 3); $("petMood").textContent = "Ням-ням! Плюша довольна 🍓"; }
  if (button.dataset.pet === "play") { p.happy = Math.min(100, p.happy + 16); p.energy = Math.max(0, p.energy - 12); p.food = Math.max(0, p.food - 7); $("petMood").textContent = "Ура, как весело! 🎀"; }
  if (button.dataset.pet === "sleep") { p.energy = Math.min(100, p.energy + 22); $("petMood").textContent = "Сладких снов, Плюша 🌙"; }
  localStorage.setItem("luna_pet_v2", JSON.stringify(p)); paintPet();
}));
onAuthStateChanged(auth, async (user) => {
  state.user = user;
  closeChat();
  if (!user) {
    await loadProfile(null);
    loadNotes();
    return;
  }
  await loadProfile(user);
  loadNotes();
});
setPersistence(auth, browserLocalPersistence).catch((error) => tell(errorMessage(error, "auth")));
loadPeriod();
loadPet();
loadNotes();
