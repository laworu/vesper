let appSDK,authSDK,dbSDK,auth,db,user,stopSnapshot,stopAuth;
let config={firebase:null,chat:false,push:false,vapidPublicKey:null};
let onUser=()=>{},onRecords=()=>{},onStatus=()=>{};
let activeIdentity=null,authEpoch=0,lastError='',serverSeen=false,loadingTimer,snapshotFailed=false;
const safe=value=>JSON.parse(JSON.stringify(value));
function requireAccount(uid){
  if(!db||!user?.emailVerified||user.uid!==uid)throw Error('Профиль изменился. Повтори действие в текущем аккаунте.');
}
function syncFailure(error){
  const code=String(error?.code||'');
  lastError=code.includes('permission-denied')?'Не удалось открыть облачные записи. Проверь доступ к базе в настройках Firebase.':code.includes('unavailable')?'Сейчас нет связи с облаком. Изменения на этом устройстве сохраняются.':'Не удалось синхронизировать записи. Проверь подключение и попробуй ещё раз.';
  onStatus('error');
}
export const syncErrorMessage=()=>lastError;
export async function configure(handlers,options={}){
  onUser=handlers.onUser;onRecords=handlers.onRecords;onStatus=handlers.onStatus;
  if(options.config)config=options.config;
  else{try{const response=await fetch('/api/config',{cache:'no-store'});if(response.ok)config=await response.json();}catch{}}
  if(!config.firebase){onStatus('local');return config;}
  try{
    if(options.services)({app:appSDK,auth:authSDK,firestore:dbSDK}=options.services);
    else [appSDK,authSDK,dbSDK]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js')
    ]);
    const app=appSDK.initializeApp(config.firebase,options.appName);
    auth=authSDK.getAuth(app);auth.languageCode='ru';db=dbSDK.getFirestore(app);
    if(options.authEmulator)authSDK.connectAuthEmulator(auth,options.authEmulator,{disableWarnings:true});
    if(options.firestoreEmulator)dbSDK.connectFirestoreEmulator(db,options.firestoreEmulator.host,options.firestoreEmulator.port);
    stopAuth=authSDK.onIdTokenChanged(auth,handleAccount);
  }catch(error){syncFailure(error);}
  return config;
}
async function handleAccount(account){
  const identity=account?account.uid+':'+String(account.emailVerified):'guest';
  user=account;
  if(identity===activeIdentity)return;
  const previousIdentity=activeIdentity;
  activeIdentity=identity;const epoch=++authEpoch;
  stopSnapshot?.();stopSnapshot=null;clearTimeout(loadingTimer);lastError='';serverSeen=false;snapshotFailed=false;
  if(previousIdentity&&previousIdentity!=='guest'&&previousIdentity.split(':')[0]!==account?.uid)await unsubscribeDeviceOnly();
  if(epoch!==authEpoch)return;
  if(!account){onUser(null);onStatus('local');return;}
  if(!account.emailVerified){onUser({uid:account.uid,email:account.email,unverified:true});onStatus('verify');return;}
  const uid=account.uid;
  onUser({uid,email:account.email,name:account.displayName||''});onStatus('loading');
  loadingTimer=setTimeout(()=>{if(epoch===authEpoch&&!serverSeen)syncFailure({code:'unavailable'});},12000);
  listenToRecords(uid,epoch);
}
function listenToRecords(uid,epoch){
  stopSnapshot?.();snapshotFailed=false;
  stopSnapshot=dbSDK.onSnapshot(dbSDK.collection(db,'users',uid,'records'),{includeMetadataChanges:true},snapshot=>{
    if(epoch!==authEpoch||user?.uid!==uid)return;
    if(!snapshot.metadata.fromCache){serverSeen=true;clearTimeout(loadingTimer);lastError='';}
    onRecords(snapshot.docs.map(doc=>({...doc.data(),localPending:doc.metadata.hasPendingWrites})),{uid,fromCache:snapshot.metadata.fromCache});
    onStatus(snapshot.metadata.hasPendingWrites?'saving':snapshot.metadata.fromCache?(serverSeen?'error':'loading'):'synced');
  },error=>{if(epoch===authEpoch){snapshotFailed=true;clearTimeout(loadingTimer);syncFailure(error);}});
}
export const capabilities=()=>config;
export const account=()=>user;
export const configured=()=>Boolean(auth);
export async function signIn(email,password){if(!auth)throw Error('Онлайн-вход пока недоступен. Данные на этом устройстве сохраняются.');return authSDK.signInWithEmailAndPassword(auth,email,password);}
export async function signUp(email,password){
  if(!auth)throw Error('Онлайн-регистрация пока недоступна.');
  const result=await authSDK.createUserWithEmailAndPassword(auth,email,password);
  await authSDK.sendEmailVerification(result.user);
  return result;
}
export async function googleSignIn(){if(!auth)throw Error('Онлайн-вход пока недоступен.');return authSDK.signInWithPopup(auth,new authSDK.GoogleAuthProvider());}
export async function resendVerification(){if(user)return authSDK.sendEmailVerification(user);}
export async function checkVerification(){
  if(!user)throw Error('Сначала войди в профиль.');
  await user.reload();await user.getIdToken(true);await handleAccount(user);
  if(!user.emailVerified)throw Error('Подтверждение почты пока не получено. Открой ссылку в письме и повтори проверку.');
}
export async function refreshSession(){
  if(!user?.emailVerified)return;
  const uid=user.uid;
  try{
    onStatus('loading');await dbSDK.enableNetwork(db);requireAccount(uid);
    if(snapshotFailed)listenToRecords(uid,authEpoch);
    const snapshot=await dbSDK.getDocsFromServer(dbSDK.collection(db,'users',uid,'records'));
    requireAccount(uid);serverSeen=true;clearTimeout(loadingTimer);lastError='';
    onRecords(snapshot.docs.map(doc=>({...doc.data(),localPending:false})),{uid,fromCache:false});onStatus('synced');
  }catch(error){if(user?.uid===uid)syncFailure(error);throw error;}
}
export async function signOut(){
  try{await unsubscribePush();}catch{}
  if(auth)return authSDK.signOut(auth);
}
export async function resetPassword(email){if(!auth)throw Error('Онлайн-вход пока недоступен.');return authSDK.sendPasswordResetEmail(auth,email);}
export async function api(path,body,expectedUid=user?.uid){
  const owner=user;
  if(expectedUid&&owner?.uid!==expectedUid)throw Error('Профиль изменился. Повтори действие.');
  const token=owner?await owner.getIdToken():null;
  if(expectedUid&&user?.uid!==expectedUid)throw Error('Профиль изменился. Повтори действие.');
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  let data;try{data=await response.json();}catch{throw Error('Сервис сейчас недоступен. Попробуй позже.');}
  if(!response.ok)throw Error(data.error||'Не удалось выполнить запрос.');
  return data;
}
export async function writeRecords(records,expectedUid=user?.uid){
  if(!records.length)return;
  requireAccount(expectedUid);onStatus('saving');
  try{
    for(let i=0;i<records.length;i+=400){
      requireAccount(expectedUid);
      const batch=dbSDK.writeBatch(db);
      for(const record of records.slice(i,i+400))batch.set(dbSDK.doc(db,'users',expectedUid,'records',record.kind+':'+record.id),safe(record));
      await batch.commit();requireAccount(expectedUid);
    }
  }catch(error){if(user?.uid===expectedUid)syncFailure(error);throw error;}
}
export async function readRecords(keys,expectedUid=user?.uid){
  requireAccount(expectedUid);
  const snapshots=await Promise.all(keys.map(key=>dbSDK.getDocFromServer(dbSDK.doc(db,'users',expectedUid,'records',key.kind+':'+key.id))));
  requireAccount(expectedUid);
  return snapshots.filter(doc=>doc.exists()).map(doc=>doc.data());
}
export async function syncReminders(items,expectedUid=user?.uid){
  if(!config.push||!items.length)return;
  requireAccount(expectedUid);
  for(let i=0;i<items.length;i+=400){
    requireAccount(expectedUid);const batch=dbSDK.writeBatch(db);
    for(const item of items.slice(i,i+400))batch.set(dbSDK.doc(db,'reminders',expectedUid+':'+item.id),safe({...item,uid:expectedUid}));
    await batch.commit();requireAccount(expectedUid);
  }
}
async function unsubscribeDeviceOnly(){
  if(typeof navigator==='undefined'||!('serviceWorker'in navigator))return;
  try{const registration=await navigator.serviceWorker.getRegistration();const sub=await registration?.pushManager.getSubscription();if(sub)await sub.unsubscribe();}catch{}
}
export async function subscribePush(){
  const uid=user?.uid;requireAccount(uid);
  if(!config.push||!config.vapidPublicKey)throw Error('Фоновые уведомления ещё не подключены.');
  if(!('serviceWorker'in navigator)||!('PushManager'in window))throw Error('Этот браузер не поддерживает уведомления. На iPhone добавь VESPER на экран «Домой».');
  if(await Notification.requestPermission()!=='granted')throw Error('Разреши уведомления в настройках браузера.');
  requireAccount(uid);
  const registration=await navigator.serviceWorker.ready;requireAccount(uid);
  let sub=await registration.pushManager.getSubscription();
  if(!sub){
    const key=config.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/');
    const bytes=Uint8Array.from(atob(key.padEnd(Math.ceil(key.length/4)*4,'=')),c=>c.charCodeAt(0));
    sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  }
  await api('/api/push-subscribe',{subscription:sub.toJSON()},uid);
  return sub;
}
export async function unsubscribePush(){
  if(typeof navigator==='undefined'||!('serviceWorker'in navigator))return;
  const uid=user?.uid,registration=await navigator.serviceWorker.getRegistration(),sub=await registration?.pushManager.getSubscription();
  if(sub){try{if(uid)await api('/api/push-subscribe',{subscription:sub.toJSON(),remove:true},uid);}finally{await sub.unsubscribe();}}
}
export function dispose(){authEpoch++;clearTimeout(loadingTimer);stopSnapshot?.();stopAuth?.();activeIdentity=null;user=null;}
export function authMessage(error){
  return ({'auth/invalid-credential':'Проверь почту и пароль.','auth/email-already-in-use':'Профиль с такой почтой уже есть. Войди или восстанови пароль.','auth/weak-password':'Нужен пароль минимум из 6 символов.','auth/invalid-email':'Проверь адрес электронной почты.','auth/popup-closed-by-user':'Окно входа закрыто.','auth/operation-not-allowed':'Этот способ входа пока не включён.','auth/configuration-not-found':'В Firebase Console ещё нужно включить Authentication.','auth/unauthorized-domain':'Вход с этого адреса сайта ещё не настроен.','auth/too-many-requests':'Слишком много попыток. Попробуй позже.','auth/network-request-failed':'Проверь соединение с интернетом.'})[error?.code]||error?.message||'Не удалось войти.';
}
