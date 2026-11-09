/* NAMDA card book: local records stay local; cloud records belong to one uid. */
(() => {
  'use strict';
  const KEY = 'namda_business_cards_v1';
  const $ = id => document.getElementById(id);
  const fields = ['name', 'company', 'title', 'phone', 'email', 'memo'];
  const limits = { name: 100, company: 150, title: 100, phone: 60, email: 150, memo: 2000 };
  const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });
  const clean = value => String(value == null ? '' : value);
  const normalizePhone = value => window.NAMDA_SCANNER?.canonicalPhone(value) || clean(value).replace(/[^0-9]/g, '');
  let signedInUser = null;
  let accountGeneration = 0;
  let photoData = '';
  let saving = false;
  let scanner = null;

  function validateCard(value) {
    if (!value || typeof value !== 'object' || typeof value.name !== 'string' || !value.name.trim()) return null;
    const card = { id: typeof value.id === 'string' && value.id && !value.id.includes('/') ? value.id : crypto.randomUUID() };
    for (const field of fields) card[field] = clean(value[field]).trim().slice(0, limits[field]);
    card.photo = typeof value.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/i.test(value.photo) ? value.photo : '';
    return card;
  }
  function loadLocal() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(data) ? data.map(validateCard).filter(Boolean) : [];
    } catch { return []; }
  }
  let records = loadLocal();
  function toast(message) {
    const element = $('toast');
    element.textContent = message;
    element.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { element.hidden = true; }, 6500);
  }
  function saveLocal(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); return true; }
    catch { toast('기기 저장 공간이 부족하거나 저장이 차단되었습니다. JSON 백업을 먼저 받아 주세요.'); return false; }
  }
  function stopLiveScan() { scanner?.stop(); }
  function show(view) {
    if (view !== 'register') stopLiveScan();
    for (const button of document.querySelectorAll('[data-view]')) {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    for (const section of document.querySelectorAll('section.view')) section.hidden = section.id !== 'view-' + view;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function expandManual(open) {
    $('manualWrap').hidden = !open;
    $('toggleManual').setAttribute('aria-expanded', String(open));
    $('toggleManual').textContent = open ? '입력창 접기' : '직접 입력하기';
  }
  function resetForm() {
    stopLiveScan();
    $('form').reset();
    $('id').value = '';
    photoData = '';
    $('registerTitle').textContent = '새 명함 등록';
    $('saveBtn').textContent = '명함 저장';
    expandManual(false);
  }
  function editCard(card) {
    resetForm();
    $('id').value = card.id;
    for (const field of fields) $(field).value = card[field] || '';
    photoData = card.photo || '';
    $('registerTitle').textContent = '명함 수정';
    $('saveBtn').textContent = '수정 저장';
    expandManual(true);
    show('register');
  }
  function download(content, name, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const vcEsc = value => clean(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  function vcard(card) {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + vcEsc(card.name)];
    for (const [field, label] of [['company', 'ORG'], ['title', 'TITLE'], ['phone', 'TEL;TYPE=CELL'], ['email', 'EMAIL'], ['memo', 'NOTE']]) {
      if (card[field]) lines.push(label + ':' + vcEsc(card[field]));
    }
    return [...lines, 'END:VCARD'].join('\r\n') + '\r\n';
  }
  function duplicate(item) {
    const number = normalizePhone(item.phone);
    const email = clean(item.email).trim().toLowerCase();
    return records.find(card => card.id !== item.id && ((number && normalizePhone(card.phone) === number) || (email && card.email.toLowerCase() === email)));
  }
  async function storeItem(value, ask) {
    const item = validateCard(value);
    if (!item) { toast('인식한 이름을 확인해 주세요.'); return false; }
    if (saving) return false;
    const existing = duplicate(item);
    if (existing && ask && !confirm(existing.name + ' 명함과 연락처가 같습니다. 별도 명함으로 저장할까요?')) return false;
    if (existing && !ask) { toast('이미 등록된 명함입니다: ' + existing.name); show('contacts'); return false; }
    const owner = signedInUser?.uid || null;
    const generation = accountGeneration;
    saving = true;
    $('saveBtn').disabled = true;
    try {
      if (owner) await window.NAMDA_AUTH.putCard(item);
      if (generation !== accountGeneration || owner !== (signedInUser?.uid || null)) return false;
      const next = [item, ...records.filter(card => card.id !== item.id)];
      if (!owner && !saveLocal(next)) return false;
      records = next;
      render();
      return true;
    } catch (error) { toast(error.message || '명함을 저장하지 못했습니다.'); return false; }
    finally { saving = false; $('saveBtn').disabled = false; }
  }
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = clean(text);
    return element;
  }
  function action(label, kind, callback) {
    const button = node('button', 'btn ' + kind + ' btn-small', label);
    button.type = 'button'; button.addEventListener('click', callback);
    return button;
  }
  async function deleteCard(card) {
    if (!confirm(card.name + ' 명함을 삭제할까요?')) return;
    const owner = signedInUser?.uid || null;
    const generation = accountGeneration;
    try {
      if (owner) await window.NAMDA_AUTH.removeCard(card.id);
      if (generation !== accountGeneration || owner !== (signedInUser?.uid || null)) return;
      const next = records.filter(value => value.id !== card.id);
      if (!owner && !saveLocal(next)) return;
      records = next; render(); toast('명함을 삭제했습니다.');
    } catch (error) { toast(error.message || '명함을 삭제하지 못했습니다.'); }
  }
  function makeCard(card) {
    const item = node('article', 'contact');
    const head = node('div', 'contact-head');
    const headline = node('div');
    headline.append(node('h3', '', card.name), node('p', 'org', [card.company, card.title].filter(Boolean).join(' · ') || '소속 정보 없음'));
    head.append(node('div', 'avatar', card.name.trim().slice(0, 1)), headline); item.append(head);
    const classification = window.NAMDA_SEMANTIC?.analyze(card);
    if (classification?.industry) {
      const badge = node('span', 'industry-badge', classification.industry);
      badge.title = classification.sourceLabel + ' · ' + (classification.evidence || []).join(', ');
      item.append(badge);
    }
    const detail = node('div', 'detail');
    if (card.phone) detail.append(node('div', '', card.phone));
    if (card.email) detail.append(node('div', '', card.email));
    if (card.memo && !/^(명함|자동) 인식 원문[:：]/.test(card.memo)) detail.append(node('div', '', card.memo.slice(0, 95)));
    item.append(detail);
    const buttons = node('div', 'card-actions');
    if (card.phone) {
      const call = node('a', 'btn btn-primary btn-small', '전화');
      call.href = 'tel:' + card.phone.replace(/[^+0-9]/g, ''); buttons.append(call);
    } else if (card.email) {
      const mail = node('a', 'btn btn-primary btn-small', '이메일');
      mail.href = 'mailto:' + encodeURIComponent(card.email); buttons.append(mail);
    }
    buttons.append(action('수정', 'btn-soft', () => editCard(card)));
    const more = node('div', 'card-extra'); more.hidden = true;
    const moreButton = action('상세·연결', 'btn-outline', () => { more.hidden = !more.hidden; moreButton.setAttribute('aria-expanded', String(!more.hidden)); });
    moreButton.setAttribute('aria-expanded', 'false'); buttons.append(moreButton);
    item.append(buttons);
    if (card.photo) {
      const photo = node('img'); photo.src = card.photo; photo.alt = card.name + ' 명함'; photo.loading = 'lazy'; more.append(photo);
    }
    if (classification?.industry) more.append(node('p', 'semantic-label', classification.sourceLabel + ': ' + classification.evidence.join(', ')));
    const related = window.NAMDA_SEMANTIC?.related(card, records) || [];
    if (related.length) {
      const connections = node('div', 'connections'); connections.append(node('strong', '', '함께 살펴볼 인맥'));
      for (const match of related.slice(0, 3)) connections.append(node('p', 'connection-row', match.card.name + ' · ' + match.reason));
      more.append(connections);
    }
    const links = window.NAMDA_SEMANTIC?.companyLinks(card) || [];
    if (links.length) {
      const row = node('div', 'card-more');
      for (const link of links) {
        const anchor = node('a', 'btn btn-outline btn-small', link.label);
        anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; row.append(anchor);
      }
      more.append(row, node('p', 'semantic-label', '외부 검색 결과에서 회사와 업종을 확인하세요.'));
    }
    const moreActions = node('div', 'card-more');
    if (card.email && card.phone) {
      const email = node('a', 'btn btn-soft btn-small', '이메일'); email.href = 'mailto:' + encodeURIComponent(card.email); moreActions.append(email);
    }
    moreActions.append(action('연락처 저장', 'btn-soft', () => download(vcard(card), card.name.replace(/[\\/:*?"<>|]/g, '_') + '.vcf', 'text/vcard;charset=utf-8')));
    moreActions.append(action('삭제', 'btn-danger', () => deleteCard(card)));
    more.append(moreActions); item.append(more); return item;
  }
  function render() {
    const query = $('search').value.trim();
    const industry = $('industryFilter')?.value || '';
    const found = records.filter(card => {
      const matches = window.NAMDA_SEMANTIC ? window.NAMDA_SEMANTIC.search(card, query) : fields.some(field => card[field].toLowerCase().includes(query.toLowerCase()));
      return matches && (!industry || window.NAMDA_SEMANTIC?.analyze(card).industry === industry);
    }).sort((left, right) => collator.compare(left.name.replace(/\s/g, ''), right.name.replace(/\s/g, '')) || collator.compare(left.company, right.company));
    $('count').textContent = found.length + '명';
    if ($('totalCount')) $('totalCount').textContent = records.length;
    if ($('companyCount')) $('companyCount').textContent = new Set(records.map(card => card.company).filter(Boolean)).size;
    $('cards').replaceChildren(...found.map(makeCard));
    $('empty').hidden = found.length > 0;
    $('emptyTitle').textContent = query || industry ? '검색 결과가 없어요' : '첫 번째 인연을 기록해 보세요';
    $('emptySubtitle').textContent = query || industry ? '이름, 회사 또는 업종으로 다시 찾아보세요.' : '명함 자동 인식을 시작하고 명함을 가이드에 맞춰 주세요.';
  }
  function scanDraft(parsed, photo, reason) {
    photoData = photo || '';
    $('id').value = '';
    for (const field of fields) $(field).value = clean(parsed?.[field]).slice(0, limits[field]);
    $('registerTitle').textContent = '인식 결과 확인';
    $('ocrStatus').textContent = reason || '인식한 내용을 확인하고 저장해 주세요.';
    expandManual(true); show('register');
  }
  if (window.NAMDA_SCANNER) {
    scanner = window.NAMDA_SCANNER.create({
      onNavigate: () => show('register'),
      onResult: async card => {
        const stored = await storeItem(card, false);
        if (stored) { resetForm(); toast('명함을 자동으로 저장했습니다. 이름과 연락처를 확인해 주세요.'); show('contacts'); }
        return stored;
      },
      onDraft: scanDraft,
      onError: toast,
    });
  }
  async function startScan() {
    if (!scanner) { toast('스캔 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.'); return; }
    if (saving) return;
    resetForm(); show('register');
    await scanner.start();
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => show(button.dataset.view)));
  $('heroCamera').addEventListener('click', startScan);
  $('cameraBtn').addEventListener('click', startScan);
  $('stopLive').addEventListener('click', stopLiveScan);
  $('galleryBtn').addEventListener('click', () => { stopLiveScan(); $('photo').click(); });
  $('photo').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (file && !saving) {
      resetForm(); show('register');
      if (scanner) await scanner.scanFile(file); else toast('스캔 모듈을 불러오지 못했습니다.');
    }
    $('photo').value = '';
  });
  $('toggleManual').addEventListener('click', () => { stopLiveScan(); expandManual($('manualWrap').hidden); });
  $('newRecord').addEventListener('click', () => { resetForm(); toast('새 명함을 등록할 수 있습니다.'); });
  $('cancelEdit').addEventListener('click', () => { resetForm(); show('contacts'); });
  $('search').addEventListener('input', render);
  if ($('industryFilter')) {
    for (const industry of window.NAMDA_SEMANTIC?.industries() || []) {
      const option = node('option', '', industry); option.value = industry; $('industryFilter').append(option);
    }
    $('industryFilter').addEventListener('change', render);
  }
  $('form').addEventListener('submit', async event => {
    event.preventDefault(); stopLiveScan();
    const item = { id: $('id').value || crypto.randomUUID(), ...Object.fromEntries(fields.map(field => [field, $(field).value.trim()])), photo: photoData };
    if (await storeItem(item, true)) { resetForm(); toast('명함을 저장했습니다.'); show('contacts'); }
  });
  $('export').addEventListener('click', () => download(JSON.stringify(records, null, 2), 'namda-cards-backup.json', 'application/json;charset=utf-8'));
  $('vcardAll').addEventListener('click', () => {
    if (!records.length) { toast('내보낼 명함이 없습니다.'); return; }
    const sorted = [...records].sort((a, b) => collator.compare(a.name.replace(/\s/g, ''), b.name.replace(/\s/g, '')));
    download(sorted.map(vcard).join('\r\n'), 'namda-contacts.vcf', 'text/vcard;charset=utf-8');
  });
  $('importBtn').addEventListener('click', () => {
    if (signedInUser) { toast('계정 명함첩에 백업을 복원하는 기능은 아직 제공되지 않습니다.'); return; }
    $('import').click();
  });
  $('import').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    const generation = accountGeneration;
    try {
      if (signedInUser || file.size > 15 * 1024 * 1024) throw new Error('백업 파일 또는 로그인 상태를 확인해 주세요.');
      const parsed = JSON.parse(await file.text());
      if (generation !== accountGeneration || signedInUser) return;
      if (!Array.isArray(parsed) || !parsed.every(card => validateCard(card))) throw new Error('올바른 명함 JSON 백업이 아닙니다.');
      if (!confirm('기기 명함 ' + records.length + '개를 백업의 ' + parsed.length + '개로 교체할까요? 기존 명함은 먼저 백업해 주세요.')) return;
      const next = parsed.map(card => ({ ...validateCard(card), id: crypto.randomUUID() }));
      if (!saveLocal(next)) return;
      records = next; render(); toast('백업을 복원했습니다.'); show('contacts');
    } catch (error) { toast(error.message || '백업 파일을 읽지 못했습니다.'); }
    finally { $('import').value = ''; }
  });
  function accountChanged(user) {
    accountGeneration += 1; resetForm(); signedInUser = user;
    records = user ? [] : loadLocal();
    $('search').value = '';
    if ($('industryFilter')) $('industryFilter').value = '';
    updateAuthDisplay(); render(); show('contacts');
  }
  function updateAuthDisplay() {
    const auth = window.NAMDA_AUTH;
    const working = auth?.status === 'signing-in' || auth?.status === 'signing-out';
    $('loginBtn').hidden = !!signedInUser;
    $('loginBtn').disabled = !auth?.available || working;
    $('loginBtn').title = auth?.reason || '';
    $('logoutBtn').hidden = !signedInUser;
    $('logoutBtn').disabled = working;
    $('accountStatus').textContent = signedInUser ? (signedInUser.displayName || signedInUser.email || 'Google 계정') + ' · 개인 명함첩' : auth?.available ? '기기 보관 · 로그인하면 계정별 저장' : '기기 보관 · 로그인 연결 필요';
    if ($('loginNotice')) $('loginNotice').textContent = auth?.configured ? auth.reason || (signedInUser ? '로그인한 계정의 명함을 사용 중입니다.' : 'Google 로그인 후 계정별 명함첩을 사용할 수 있습니다.') : 'Google 로그인과 계정 동기화는 운영자 연결이 아직 완료되지 않았습니다. 자동 인식과 기기 내 저장은 사용할 수 있습니다.';
  }
  window.addEventListener('namda-auth-state', event => accountChanged(event.detail.user));
  window.addEventListener('namda-auth-status', updateAuthDisplay);
  window.addEventListener('namda-cloud-cards', event => {
    if (!signedInUser || event.detail.uid !== signedInUser.uid) return;
    records = Array.isArray(event.detail.cards) ? event.detail.cards.map(validateCard).filter(Boolean) : [];
    render();
  });
  window.addEventListener('namda-auth-error', event => {
    if (event.detail.uid && event.detail.uid !== signedInUser?.uid) return;
    toast(event.detail.message); updateAuthDisplay();
  });
  window.addEventListener('namda-auth-unavailable', updateAuthDisplay);
  window.addEventListener('namda-auth-notice', event => toast(event.detail.message));
  $('loginBtn').addEventListener('click', async () => {
    if (!window.NAMDA_AUTH?.available) { toast('Google 로그인은 운영자 연결이 필요합니다. 지금은 기기 내 명함첩을 이용해 주세요.'); return; }
    stopLiveScan();
    try { await window.NAMDA_AUTH.signIn(); } catch (error) { toast(error.message); }
  });
  $('logoutBtn').addEventListener('click', async () => {
    stopLiveScan();
    try { await window.NAMDA_AUTH.signOut(); } catch (error) { toast(error.message); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopLiveScan(); });
  window.addEventListener('pagehide', stopLiveScan);
  updateAuthDisplay(); render(); show('contacts');
})();
