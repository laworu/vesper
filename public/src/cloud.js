let appSDK, authSDK, dbSDK, auth, db, user, stopSnapshot;
let config = { firebase: null, chat: false, push: false, vapidPublicKey: null };
let onUser = () => {}, onRecords = () => {}, onStatus = () => {};
const safe = value => JSON.parse(JSON.stringify(value));
export async function configure(handlers) {
  onUser = handlers.onUser; onRecords = handlers.onRecords; onStatus = handlers.onStatus;
  try {
    const response = await fetch('/api/config', {cache:'no-store'});
    if (response.ok) config = await response.json();
  } catch {}
  if (!config.firebase) { onStatus('local'); return config; }
  try {
    [appSDK, authSDK, dbSDK] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js')
    ]);
    const app = appSDK.initializeApp(config.firebase);
    auth = authSDK.getAuth(app); db = dbSDK.getFirestore(app);
    authSDK.onAuthStateChanged(auth, async account => {
      if (stopSnapshot) stopSnapshot();
      user = account;
      if (!account) { onUser(null); onStatus('local'); return; }
      if (!account.emailVerified) { onUser({uid:account.uid, email:account.email, unverified:true}); onStatus('verify'); return; }
      onUser({uid:account.uid, email:account.email, name:account.displayName || ''});
      onStatus('loading');
      stopSnapshot = dbSDK.onSnapshot(dbSDK.collection(db, 'users', account.uid, 'records'), {includeMetadataChanges:true}, snapshot => {
        onRecords(snapshot.docs.map(d => d.data())); onStatus(snapshot.metadata.hasPendingWrites?'saving':snapshot.metadata.fromCache?'error':'synced');
      }, () => onStatus('error'));
    });
  } catch { onStatus('error'); }
  return config;
}
export const capabilities = () => config;
export const account = () => user;
export const configured = () => Boolean(auth);
export async function signIn(email, password) { if (!auth) throw Error('Онлайн-вход пока недоступен. Данные на этом устройстве сохраняются.'); return authSDK.signInWithEmailAndPassword(auth,email,password); }
export async function signUp(email,password) {
  if (!auth) throw Error('Онлайн-регистрация пока недоступна.');
  const result = await authSDK.createUserWithEmailAndPassword(auth,email,password);
  await authSDK.sendEmailVerification(result.user);
  return result;
}
export async function googleSignIn() {
  if (!auth) throw Error('Онлайн-вход пока недоступен.');
  return authSDK.signInWithPopup(auth,new authSDK.GoogleAuthProvider());
}
export async function resendVerification() { if (user) return authSDK.sendEmailVerification(user); }
export async function checkVerification() { if (!user) return; await user.reload(); await user.getIdToken(true); location.reload(); }
export async function resetPassword(email) { if (!auth) throw Error('Онлайн-вход пока недоступен.'); return authSDK.sendPasswordResetEmail(auth,email); }
export async function signOut() { if (auth) return authSDK.signOut(auth); }
export async function api(path, body) {
  const token = user ? await user.getIdToken() : null;
  const response = await fetch(path, { method:'POST',headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {})},body:JSON.stringify(body) });
  let data; try { data = await response.json(); } catch { throw Error('Сервис сейчас недоступен. Попробуй позже.'); }
  if (!response.ok) throw Error(data.error || 'Не удалось выполнить запрос.');
  return data;
}
export async function writeRecords(records) {
  if (!db || !user?.emailVerified || !records.length) return;
  onStatus('saving');
  try {
    for (let i=0;i<records.length;i+=400) {
      const batch=dbSDK.writeBatch(db);
      for (const record of records.slice(i,i+400)) batch.set(dbSDK.doc(db,'users',user.uid,'records',`${record.kind}:${record.id}`),safe(record));
      await batch.commit();
    }
    onStatus('synced');
  } catch (error) { onStatus('error'); throw error; }
}
export async function syncReminders(items) {
  if (!db || !user?.emailVerified || !config.push) return;
  for(let i=0;i<items.length;i+=400) {
    const batch=dbSDK.writeBatch(db);
    for (const item of items.slice(i,i+400)) batch.set(dbSDK.doc(db,'reminders',`${user.uid}:${item.id}`),safe({...item,uid:user.uid}));
    await batch.commit();
  }
}
export async function subscribePush() {
  if (!user?.emailVerified) throw Error('Для уведомлений войди в подтверждённый онлайн-профиль.');
  if (!config.push || !config.vapidPublicKey) throw Error('Фоновые уведомления ещё не подключены.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw Error('Этот браузер не поддерживает уведомления. На iPhone добавь VESPER на экран «Домой».');
  if (await Notification.requestPermission() !== 'granted') throw Error('Разреши уведомления в настройках браузера.');
  const registration=await navigator.serviceWorker.ready;
  let sub=await registration.pushManager.getSubscription();
  if(!sub) {
    const key=config.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/');
    const bytes=Uint8Array.from(atob(key.padEnd(Math.ceil(key.length/4)*4,'=')),c=>c.charCodeAt(0));
    sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  }
  await api('/api/push-subscribe',{subscription:sub.toJSON()});
  return sub;
}
export async function unsubscribePush() {
  const registration=await navigator.serviceWorker.ready;
  const sub=await registration.pushManager.getSubscription();
  if(sub) { await api('/api/push-subscribe',{subscription:sub.toJSON(),remove:true}); await sub.unsubscribe(); }
}
export function authMessage(error) {
  return ({'auth/invalid-credential':'Проверь почту и пароль.','auth/email-already-in-use':'Профиль с такой почтой уже есть. Войди или восстанови пароль.','auth/weak-password':'Нужен пароль минимум из 6 символов.','auth/invalid-email':'Проверь адрес электронной почты.','auth/popup-closed-by-user':'Окно входа закрыто.','auth/operation-not-allowed':'Этот способ входа пока не включён.','auth/unauthorized-domain':'Вход с этого адреса сайта ещё не настроен.','auth/too-many-requests':'Слишком много попыток. Попробуй позже.','auth/network-request-failed':'Проверь соединение с интернетом.'})[error?.code] || error?.message || 'Не удалось войти.';
}
