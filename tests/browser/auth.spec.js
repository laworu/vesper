import {test,expect} from '@playwright/test';

async function mockFirebase(page,{verified=true,permissionDenied=false}={}){
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('**/api/config',route=>route.fulfill({json:{version:7,firebase:{projectId:'ui-test-only',apiKey:'fake',appId:'fake'},chat:false,push:false}}));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-app.js',route=>route.fulfill({contentType:'text/javascript',body:'export const initializeApp=()=>({});'}));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-auth.js',route=>route.fulfill({contentType:'text/javascript',body:`
    export const getAuth=()=>({});
    export function onIdTokenChanged(auth,callback){setTimeout(()=>callback({uid:'alice',email:'alice@example.invalid',emailVerified:${verified}}),100);return ()=>{};}
  `}));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-firestore.js',route=>route.fulfill({contentType:'text/javascript',body:`
    export const getFirestore=()=>({});
    export const collection=()=>({});
    export function onSnapshot(ref,options,callback,error){setTimeout(()=>{
      ${permissionDenied?"error({code:'permission-denied'});":`callback({metadata:{fromCache:false,hasPendingWrites:false},docs:[{data:()=>({kind:'profile',id:'main',body:{name:'Алиса',updatedAt:1},updatedAt:1}),metadata:{hasPendingWrites:false}}]});`}
    },150);return ()=>{};}
  `}));
}

test('restored cloud login closes guest onboarding without replacing the saved profile',async({page})=>{
  await mockFirebase(page);
  await page.goto('/');
  await expect(page.locator('.greeting')).toContainText('Алиса');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.side-status')).toContainText('Профиль синхронизирован');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('vesper7:alice')));
  expect(stored.profile.name).toBe('Алиса');expect(stored._sync.pending).toEqual({});
});

test('unverified login shows verification before cloud onboarding',async({page})=>{
  await mockFirebase(page,{verified:false});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Подтверди свою почту'})).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('button',{name:'Подтвердить почту',exact:true}).click();
  await expect(page.getByRole('button',{name:'Я подтвердил(а) почту'})).toBeVisible();
});

test('denied cloud access offers retry without opening an empty profile',async({page})=>{
  await mockFirebase(page,{permissionDenied:true});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Не удалось открыть облачные записи'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Попробовать снова'})).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
