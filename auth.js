/* Firebase Authentication and per-account card storage.
 * Configuration belongs in firebase-config.js, never in an end-user login form.
 * Loading the Firebase SDK is deferred until a real project is configured.
 */
(() => {
  'use strict';

  const SDK_BASE = 'https://www.gstatic.com/firebasejs/11.10.0/';
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));
  let auth = null;
  let db = null;
  let sdk = null;
  let provider = null;
  let currentUser = null;
  let accountGeneration = 0;
  let unsubscribeCards = null;
  let pendingSignIn = null;
  let pendingSignOut = null;

  const api = window.NAMDA_AUTH = {
    available: false,
    configured: false,
    status: 'loading',
    reason: 'Google 로그인 연결을 확인하고 있습니다.',
    currentUser: null,
    ready: null,
    signIn,
    signOut: logOut,
    putCard,
    removeCard,
  };

  function setStatus(status, reason = '') {
    api.status = status;
    api.reason = reason;
    emit('namda-auth-status', {
      status, reason, available: api.available, configured: api.configured,
    });
  }

  function unavailable(reason, status = 'setup-required') {
    api.available = false;
    setStatus(status, reason);
    emit('namda-auth-unavailable', { reason, status });
  }

  function publicUser(user) {
    return user ? {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
    } : null;
  }

  function readableError(error) {
    const code = String(error?.code || '');
    const messages = {
      'auth/unauthorized-domain': '이 사이트가 로그인 허용 도메인에 등록되지 않았습니다. 운영자가 Firebase에 현재 사이트 도메인을 등록해야 합니다.',
      'auth/operation-not-allowed': 'Firebase에서 Google 로그인 사용 설정이 필요합니다.',
      'auth/configuration-not-found': 'Firebase Authentication 설정이 아직 없습니다.',
      'auth/invalid-api-key': 'Firebase 웹 앱 연결값이 올바르지 않습니다. 운영자 설정을 확인해 주세요.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase 웹 앱 연결값이 올바르지 않습니다.',
      'auth/app-not-authorized': '현재 사이트에 Firebase 인증 사용 권한이 없습니다.',
      'auth/network-request-failed': '네트워크에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
      'auth/popup-blocked': '로그인 창이 차단되었습니다. Chrome 또는 Safari에서 이 사이트를 열고 팝업을 허용해 주세요.',
      'auth/popup-closed-by-user': 'Google 로그인이 취소되었습니다.',
      'auth/cancelled-popup-request': '이미 Google 로그인이 진행 중입니다.',
      'auth/operation-not-supported-in-this-environment': '이 앱 안에서는 Google 로그인 창을 열 수 없습니다. Chrome 또는 Safari에서 사이트를 열어 주세요.',
      'auth/web-storage-unsupported': '브라우저 저장소가 차단되어 있습니다. 일반 브라우저 창에서 다시 시도해 주세요.',
      'auth/account-changed': '요청 중 로그인 계정이 바뀌었습니다. 현재 계정의 명함첩을 확인해 주세요.',
      'auth/required': 'Google 로그인이 필요합니다.',
      'auth/not-ready': api.reason || 'Google 로그인 연결이 아직 준비되지 않았습니다.',
      'permission-denied': '이 계정의 명함에 접근할 수 없습니다. 운영자가 Firestore 보안 규칙을 확인해야 합니다.',
      'unauthenticated': '로그인이 만료되었습니다. Google에 다시 로그인해 주세요.',
      'unavailable': '클라우드에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.',
    };
    const result = new Error(messages[code] || error?.message || '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    result.code = code;
    return result;
  }

  function errorWithCode(code) {
    return readableError({ code });
  }

  function session() {
    if (!api.available || !sdk || !auth) throw errorWithCode('auth/not-ready');
    if (!currentUser || auth.currentUser?.uid !== currentUser.uid) throw errorWithCode('auth/required');
    return { uid: currentUser.uid, generation: accountGeneration };
  }

  function requireSameSession(owner) {
    if (owner.generation !== accountGeneration || currentUser?.uid !== owner.uid || auth.currentUser?.uid !== owner.uid) {
      throw errorWithCode('auth/account-changed');
    }
  }

  function signIn() {
    if (!api.available || !sdk || !auth) return Promise.reject(errorWithCode('auth/not-ready'));
    if (pendingSignIn) return pendingSignIn;
    if (pendingSignOut) return Promise.reject(new Error('로그아웃이 끝난 뒤 다시 로그인해 주세요.'));
    setStatus('signing-in', 'Google 로그인 창에서 계정을 선택해 주세요.');
    // Call the popup before any await so the browser preserves the user's click.
    // Render is a different origin from firebaseapp.com: a blind redirect fallback
    // can silently lose the session in browsers that partition third-party storage.
    try {
      pendingSignIn = sdk.signInWithPopup(auth, provider)
        .catch(error => { throw readableError(error); })
        .finally(() => {
          pendingSignIn = null;
          setStatus(currentUser ? 'signed-in' : 'ready');
        });
      return pendingSignIn;
    } catch (error) {
      setStatus(currentUser ? 'signed-in' : 'ready');
      return Promise.reject(readableError(error));
    }
  }

  function logOut() {
    if (!api.available || !sdk || !auth) return Promise.reject(errorWithCode('auth/not-ready'));
    if (pendingSignOut) return pendingSignOut;
    setStatus('signing-out', '로그아웃하고 있습니다.');
    pendingSignOut = sdk.signOut(auth)
      .catch(error => { throw readableError(error); })
      .finally(() => {
        pendingSignOut = null;
        setStatus(currentUser ? 'signed-in' : 'ready');
      });
    return pendingSignOut;
  }

  async function putCard(item) {
    const owner = session();
    if (!item || typeof item.id !== 'string' || !item.id || item.id.includes('/')) throw new Error('명함 식별자가 올바르지 않습니다.');
    if (typeof item.name !== 'string' || !item.name.trim()) throw new Error('이름을 입력해 주세요.');
    if (typeof item.photo === 'string' && item.photo.length > 500000) throw new Error('명함 이미지가 너무 큽니다. 더 작은 사진으로 다시 등록해 주세요.');
    if (navigator.onLine === false) throw errorWithCode('unavailable');
    try {
      await sdk.setDoc(sdk.doc(db, 'users', owner.uid, 'cards', item.id), item);
      requireSameSession(owner);
      return { uid: owner.uid, id: item.id };
    } catch (error) { throw readableError(error); }
  }

  async function removeCard(id) {
    const owner = session();
    if (typeof id !== 'string' || !id || id.includes('/')) throw new Error('명함 식별자가 올바르지 않습니다.');
    if (navigator.onLine === false) throw errorWithCode('unavailable');
    try {
      await sdk.deleteDoc(sdk.doc(db, 'users', owner.uid, 'cards', id));
      requireSameSession(owner);
      return { uid: owner.uid, id };
    } catch (error) { throw readableError(error); }
  }

  function accountChanged(user) {
    accountGeneration += 1;
    const generation = accountGeneration;
    if (unsubscribeCards) { unsubscribeCards(); unsubscribeCards = null; }
    currentUser = user;
    api.currentUser = publicUser(user);
    setStatus(user ? 'signed-in' : 'ready');
    // Clear the previous account's view before subscribing to the new account.
    emit('namda-auth-state', { user: api.currentUser });
    if (!user) return;
    const uid = user.uid;
    unsubscribeCards = sdk.onSnapshot(sdk.collection(db, 'users', uid, 'cards'), snapshot => {
      if (generation !== accountGeneration || currentUser?.uid !== uid) return;
      emit('namda-cloud-cards', {
        uid,
        cards: snapshot.docs.map(document => ({ ...document.data(), id: document.id })),
        fromCache: Boolean(snapshot.metadata?.fromCache),
        pending: Boolean(snapshot.metadata?.hasPendingWrites),
      });
    }, error => {
      if (generation !== accountGeneration || currentUser?.uid !== uid) return;
      const message = readableError(error).message;
      setStatus('sync-error', message);
      emit('namda-auth-error', { message, code: error.code, uid, operation: 'sync' });
    });
  }

  async function initialize() {
    const config = window.NAMDA_FIREBASE_CONFIG;
    const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const valid = config && typeof config === 'object' && required.every(key =>
      typeof config[key] === 'string' && config[key].trim() && !/^(YOUR_|PROJECT_ID$|API_KEY$|APP_ID$)/i.test(config[key]));
    if (!valid) {
      unavailable('사이트의 Firebase 연결 설정이 아직 완료되지 않았습니다. 운영자 설정 전에는 Google 로그인과 계정 동기화를 사용할 수 없습니다. 명함은 이 기기에 저장할 수 있습니다.');
      return api;
    }
    api.configured = true;
    setStatus('loading', 'Google 로그인 모듈을 불러오고 있습니다.');
    try {
      const [appSDK, authSDK, firestoreSDK] = await Promise.all([
        import(SDK_BASE + 'firebase-app.js'),
        import(SDK_BASE + 'firebase-auth.js'),
        import(SDK_BASE + 'firebase-firestore.js'),
      ]);
      sdk = { ...authSDK, ...firestoreSDK };
      const app = appSDK.initializeApp(config);
      auth = sdk.getAuth(app);
      auth.languageCode = 'ko';
      db = sdk.getFirestore(app);
      provider = new sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      // Persistence is prepared during startup, never between click and popup.
      try { await sdk.setPersistence(auth, sdk.browserLocalPersistence); }
      catch {
        await sdk.setPersistence(auth, sdk.browserSessionPersistence);
        emit('namda-auth-notice', { message: '이 브라우저에서는 창을 닫으면 로그인이 해제됩니다.' });
      }
      // Complete sessions begun by an earlier deployed version using redirect.
      // New sign-ins always use a popup unless same-origin auth is configured.
      sdk.getRedirectResult(auth).catch(error => {
        emit('namda-auth-error', { message: readableError(error).message, code: error.code, operation: 'redirect' });
      });
      api.available = true;
      setStatus('ready');
      sdk.onAuthStateChanged(auth, accountChanged, error => {
        accountChanged(null);
        emit('namda-auth-error', { message: readableError(error).message, code: error.code, operation: 'auth' });
      });
    } catch (error) {
      unavailable('Google 로그인 연결을 불러오지 못했습니다. 인터넷 연결과 사이트의 Firebase 설정을 확인해 주세요.', 'error');
      emit('namda-auth-error', { message: readableError(error).message, code: error.code, operation: 'init' });
    }
    return api;
  }

  api.ready = initialize();
})();
