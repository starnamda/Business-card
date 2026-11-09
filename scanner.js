(function (global) {
  'use strict';

  const VERSION = '5.1.1';
  const scriptSources = [
    `https://cdn.jsdelivr.net/npm/tesseract.js@${VERSION}/dist/tesseract.min.js`,
    `https://unpkg.com/tesseract.js@${VERSION}/dist/tesseract.min.js`
  ];
  let libraryPromise;
  const asText = value => String(value == null ? '' : value);
  const cancelled = () => Object.assign(new Error('스캔이 종료되었습니다.'), { name: 'AbortError' });

  function canonicalPhone(value) {
    let digits = asText(value).replace(/\D/g, '');
    if (digits.startsWith('82')) digits = '0' + digits.slice(2).replace(/^0/, '');
    return digits;
  }

  function formatPhone(value) {
    const digits = canonicalPhone(value);
    if (/^01\d\d{7,8}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
    if (/^02\d{7,8}$/.test(digits)) return digits.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3');
    if (/^0\d{2}\d{7,8}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
    return value.trim();
  }

  const companyPattern = /(?:주식회사|유한회사|유한책임|\(\s*주\s*\)|㈜|법인|그룹|대학교|대학원|연구소|연구원|병원|의원|센터|산업|상사|건설|건축|테크|시스템|솔루션|컴퍼니|파트너스|네트워크|통신|전자|협회|협동조합|재단|부동산|보험|금융|식품|물산|기획|디자인|투자|호텔|리조트|\b(?:co\.?|corp\.?|inc\.?|ltd\.?|llc|company|group|solutions?|systems?|technolog(?:y|ies)|partners?|university|hospital)\b)/i;
  const titlePattern = /(?:대표이사|공동대표|부대표|대표|회장|부회장|사장|부사장|전무이사|상무이사|전무|상무|이사|본부장|부장|차장|과장|대리|팀장|실장|센터장|연구원|책임|수석|교수|원장|변호사|세무사|회계사|건축사|공인중개사|\b(?:CEO|CTO|CFO|COO|CMO|president|director|manager|founder|engineer|consultant)\b)/gi;
  const nonNames = /^(?:이메일|메일|전화|휴대폰|연락처|팩스|주소|홈페이지|고객센터|사업자|등록번호|명함|담당자|대한민국|한국|서울|경기|부산|인천|대구|광주|대전|울산|세종|강원|제주|영업(?:부|팀|본부)?|개발(?:부|팀|본부)?|마케팅(?:부|팀)?|기획(?:부|팀)?|디자인(?:부|팀)?|경영지원(?:부|팀)?|인사총무(?:부|팀)?|감사|고문|직원|컨설팅|비즈니스|남다|구글|네이버|카카오|삼성|현대)$/;
  const surnames = '김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉사부황보남궁선우제갈독고서문';

  function parseText(raw) {
    const text = asText(raw).normalize('NFKC').replace(/\r/g, '').trim();
    const lines = text.split('\n').map(line => line.replace(/[|]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const emailText = text.replace(/\s*@\s*/g, '@').replace(/(@[\w.-]+)\s*\.\s*/g, '$1.');
    const email = emailText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
    const phonePattern = /(?:\+?82[ .()-]*0?|0)(?:1[016789]|2|[3-6][0-9]|70)[ .()-]*\d{3,4}[ .()-]*\d{4}(?!\d)/g;
    const numbers = [...text.matchAll(phonePattern)].map(match => ({
      raw: match[0],
      mobile: /^01/.test(canonicalPhone(match[0])),
      fax: /(?:fax|팩스|\bF)\s*[:.]?\s*$/i.test(text.slice(Math.max(0, match.index - 14), match.index))
    }));
    const number = numbers.find(n => n.mobile && !n.fax) || numbers.find(n => !n.fax);
    const phone = number ? formatPhone(number.raw) : '';
    const company = lines.find(line => companyPattern.test(line) && !/@|https?:|www\.|\d{3}[-.)]/i.test(line)) || '';
    const titles = lines.flatMap(line => [...line.matchAll(titlePattern)].map(match => match[0]));
    const candidates = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line === company || /@|https?:\/\/|www\.|\d|[:：]\s*\+?\d/i.test(line)) continue;
      if (companyPattern.test(line)) continue;
      const labelled = /^(?:성명|이름|name)\s*[:：]?\s*/i.test(line);
      const hasTitle = !!line.match(titlePattern);
      let candidate = line.replace(/^(?:성명|이름|name)\s*[:：]?\s*/i, '').replace(titlePattern, '').replace(/^[\s·:：/,-]+|[\s·:：/,-]+$/g, '').trim();
      const compact = candidate.replace(/\s/g, '');
      if (/^[가-힣]{2,5}$/.test(compact) && !nonNames.test(compact) && !companyPattern.test(compact)) {
        const knownSurname = surnames.includes(compact[0]);
        const score = labelled ? 1 : hasTitle ? .96 : knownSurname && compact.length >= 3 ? .86 : .55;
        candidates.push({ name: compact, score, index });
      } else if (/^[A-Z][a-z]+(?:[-'][A-Za-z]+)?(?:\s+[A-Z][a-z]+(?:[-'][A-Za-z]+)?){1,3}$/.test(candidate) && !/business|contact|office|sales|marketing|mobile|email|phone|address|network|international/i.test(candidate)) {
        candidates.push({ name: candidate, score: labelled || hasTitle ? .96 : .78, index });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.index - b.index);
    const best = candidates[0];
    const ambiguous = !!best && candidates.some(c => c.name !== best.name && c.score >= best.score && c.score >= .78);
    return {
      name: best?.name || '', company: company.slice(0, 150), title: (titles[0] || '').slice(0, 100), phone, email,
      memo: text ? '명함 인식 원문:\n' + text.slice(0, 1800) : '',
      nameConfidence: ambiguous ? .5 : (best?.score || 0), text
    };
  }

  // Maps the visible guide through object-fit: cover back to original camera pixels.
  function cropRect(videoWidth, videoHeight, stage, guide) {
    const scale = Math.max(stage.width / videoWidth, stage.height / videoHeight);
    const offsetX = (videoWidth * scale - stage.width) / 2;
    const offsetY = (videoHeight * scale - stage.height) / 2;
    const padding = 3;
    const x = Math.max(0, (guide.left - stage.left - padding + offsetX) / scale);
    const y = Math.max(0, (guide.top - stage.top - padding + offsetY) / scale);
    const width = Math.min(videoWidth - x, (guide.width + padding * 2) / scale);
    const height = Math.min(videoHeight - y, (guide.height + padding * 2) / scale);
    return { x, y, width, height };
  }

  function bounded(promise, ms, signal, message) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(cancelled()); return; }
      const finish = (fn, value) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); };
      const abort = () => finish(reject, cancelled());
      const timer = setTimeout(() => finish(reject, Object.assign(new Error(message), { code: 'scan/timeout' })), ms);
      signal?.addEventListener('abort', abort, { once: true });
      Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    });
  }

  function loadLibrary() {
    if (global.Tesseract?.createWorker) return Promise.resolve(global.Tesseract);
    if (libraryPromise) return libraryPromise;
    libraryPromise = (async () => {
      for (const src of scriptSources) {
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const timer = setTimeout(() => { script.remove(); reject(new Error('OCR 스크립트 다운로드 시간 초과')); }, 12000);
            script.src = src; script.async = true; script.crossOrigin = 'anonymous';
            script.onload = () => { clearTimeout(timer); global.Tesseract?.createWorker ? resolve() : reject(new Error('OCR 엔진 응답 오류')); };
            script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('OCR 스크립트 다운로드 실패')); };
            document.head.append(script);
          });
          return global.Tesseract;
        } catch (_) { /* Try the independent CDN once. */ }
      }
      throw Object.assign(new Error('문자 인식 엔진을 내려받지 못했습니다. 인터넷 연결을 확인한 뒤 자동 스캔을 다시 시작해 주세요.'), { code: 'scan/engine' });
    })().catch(error => { libraryPromise = null; throw error; });
    return libraryPromise;
  }

  function cameraError(error) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') return '카메라 접근이 차단됐습니다. Chrome 또는 Safari의 이 사이트 권한에서 카메라를 허용한 뒤 다시 시작해 주세요.';
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') return '사용할 수 있는 카메라가 없습니다. 명함 사진 불러오기로 등록할 수 있습니다.';
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') return '다른 앱이 카메라를 사용하고 있습니다. 해당 앱을 닫고 자동 스캔을 다시 시작해 주세요.';
    if (error.name === 'SecurityError') return '이 브라우저에서 카메라 접근을 허용하지 않습니다. Chrome 또는 Safari에서 명함첩을 열어 주세요.';
    return error.message || '스캔을 시작하지 못했습니다. 다시 시작해 주세요.';
  }

  function compressPhoto(source) {
    const canvas = document.createElement('canvas');
    let scale = Math.min(1, 1100 / Math.max(source.width, source.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL('image/jpeg', attempt === 0 ? .72 : .6);
      if (result.length <= 390000) return result;
      scale *= .75;
    }
    return '';
  }

  function create(options = {}) {
    const $ = id => document.getElementById(id);
    let current = null;
    let sequence = 0;
    const terminated = new WeakSet();
    const alive = session => current === session && !session.controller.signal.aborted;
    const text = (id, value) => { if ($(id)) $(id).textContent = value; };
    const report = (session, value) => { if (alive(session)) { text('ocrStatus', value); text('liveStatus', value); } };
    const tracksOff = stream => stream?.getTracks().forEach(track => track.stop());
    const terminate = worker => {
      if (!worker || terminated.has(worker)) return;
      terminated.add(worker);
      try { Promise.resolve(worker.terminate()).catch(() => {}); } catch (_) {}
    };
    const idleUI = () => {
      if ($('cameraBtn')) $('cameraBtn').disabled = false;
      if ($('galleryBtn')) $('galleryBtn').disabled = false;
      if ($('liveCam')) $('liveCam').hidden = true;
      if ($('liveVideo')) $('liveVideo').srcObject = null;
    };
    function stop() {
      const previous = current;
      current = null;
      if (previous) { previous.controller.abort(); tracksOff(previous.stream); terminate(previous.worker); }
      idleUI();
    }
    function begin(kind) {
      stop();
      const session = { id: ++sequence, kind, controller: new AbortController(), stream: null, worker: null };
      current = session;
      if ($('cameraBtn')) $('cameraBtn').disabled = true;
      if ($('galleryBtn')) $('galleryBtn').disabled = true;
      return session;
    }
    function finish(session) {
      session.controller.abort(); tracksOff(session.stream); terminate(session.worker);
      if (current === session) { current = null; idleUI(); }
    }
    async function workerFor(session) {
      report(session, '문자 인식 엔진을 준비하고 있습니다. 처음에는 언어 자료를 내려받습니다…');
      const library = await bounded(loadLibrary(), 27000, session.controller.signal, '문자 인식 엔진 다운로드가 지연됐습니다. 다시 시작해 주세요.');
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!alive(session)) throw cancelled();
        let failWorker;
        const workerFailure = new Promise((_, reject) => { failWorker = reject; });
        const prefix = attempt ? 'https://unpkg.com/' : 'https://cdn.jsdelivr.net/npm/';
        const config = {
          workerPath: prefix + `tesseract.js@${VERSION}/dist/worker.min.js`,
          corePath: prefix + `tesseract.js-core@${VERSION}`,
          logger(message) {
            if (!alive(session)) return;
            const percent = Math.round((Number(message.progress) || 0) * 100);
            if (/loading language/.test(message.status)) report(session, '한국어·영어 인식 자료 다운로드 ' + percent + '%');
            else if (/initializing|loading tesseract/.test(message.status)) report(session, '문자 인식 엔진 준비 중…');
            else if (message.status === 'recognizing text') report(session, '명함의 글자를 읽고 있습니다… ' + percent + '%');
          },
          errorHandler: error => failWorker(error instanceof Error ? error : new Error(asText(error)))
        };
        if (attempt) { config.langPath = 'https://tessdata.projectnaptha.com/4.0.0'; config.cacheMethod = 'none'; report(session, '다른 연결 경로로 인식 엔진을 다시 준비합니다…'); }
        let pending;
        let abandoned = false;
        try {
          pending = Promise.resolve(library.createWorker(['kor', 'eng'], 1, config));
          pending.then(worker => { if (abandoned || !alive(session)) terminate(worker); }, () => {});
          const worker = await bounded(Promise.race([pending, workerFailure]), attempt ? 35000 : 45000, session.controller.signal, '언어 자료 준비 시간이 초과됐습니다. 인터넷 연결을 확인해 주세요.');
          if (!alive(session)) { terminate(worker); throw cancelled(); }
          session.worker = worker;
          session.workerFailure = workerFailure;
          await bounded(worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' }), 8000, session.controller.signal, '문자 인식 엔진 설정이 지연됐습니다.');
          return worker;
        } catch (error) {
          abandoned = true; terminate(session.worker); session.worker = null;
          if (!alive(session)) throw cancelled();
          if (attempt) throw Object.assign(new Error('문자 인식 자료를 준비하지 못했습니다. 인터넷 연결을 확인하고 다시 시작해 주세요.'), { code: 'scan/engine', cause: error });
        }
      }
    }
    async function recognize(session, canvas) {
      return bounded(Promise.race([session.worker.recognize(canvas), session.workerFailure]), 30000, session.controller.signal, '명함 인식 시간이 초과됐습니다. 스캔을 다시 시작해 주세요.');
    }
    function itemFor(parsed, photo) {
      return { id: global.crypto.randomUUID(), name: parsed.name, company: parsed.company, title: parsed.title, phone: parsed.phone, email: parsed.email, memo: parsed.memo, photo };
    }
    async function draft(session, parsed, photo, message) {
      if (!alive(session)) return;
      finish(session);
      text('ocrStatus', message);
      await options.onDraft?.(parsed, photo, message);
    }
    async function start() {
      if (current?.kind === 'camera') return;
      options.onNavigate?.();
      if (!global.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        const message = '실시간 카메라를 사용할 수 없습니다. Chrome 또는 Safari에서 https://namda-business-card-ai.onrender.com 을 열어 주세요. 사진 불러오기도 사용할 수 있습니다.';
        text('ocrStatus', message); options.onError?.(message); return;
      }
      const session = begin('camera');
      if ($('liveCam')) $('liveCam').hidden = false;
      report(session, '카메라 사용을 허용해 주세요. 명함을 틀 안에 대면 자동으로 읽습니다.');
      try {
        const cameraPromise = navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then(stream => { if (!alive(session)) tracksOff(stream); return stream; });
        const stream = await bounded(cameraPromise, 35000, session.controller.signal, '카메라 권한 확인이 필요합니다. 사이트의 카메라 권한을 허용한 뒤 다시 시작해 주세요.');
        if (!alive(session)) { tracksOff(stream); return; }
        session.stream = stream;
        const video = $('liveVideo'); video.srcObject = stream;
        await bounded(video.play(), 12000, session.controller.signal, '카메라 영상을 시작하지 못했습니다. 다른 카메라 앱을 닫고 다시 시작해 주세요.');
        await workerFor(session);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let previousIdentity = '', stable = 0, attempts = 0, best = null;
        let frameDeadline = Date.now() + 12000;
        while (alive(session)) {
          if (video.readyState < 2 || !video.videoWidth) {
            if (Date.now() > frameDeadline) throw new Error('카메라 영상이 들어오지 않습니다. 다른 카메라 앱을 닫고 다시 시작해 주세요.');
            await bounded(new Promise(resolve => setTimeout(resolve, 250)), 1000, session.controller.signal, '카메라 영상 대기');
            continue;
          }
          frameDeadline = Date.now() + 12000;
          const stage = video.getBoundingClientRect();
          const guide = video.parentElement.querySelector('.scan-guide').getBoundingClientRect();
          const crop = cropRect(video.videoWidth, video.videoHeight, stage, guide);
          if (crop.width <= 0 || crop.height <= 0) throw new Error('카메라 가이드가 보이지 않습니다. 스캔 화면을 다시 열어 주세요.');
          const scale = Math.max(1, Math.min(2, 1500 / crop.width));
          canvas.width = Math.round(crop.width * scale); canvas.height = Math.round(crop.height * scale);
          ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
          report(session, '명함을 평평하게 대고 잠시 멈춰 주세요. 자동으로 확인하고 저장합니다.');
          const result = await recognize(session, canvas);
          if (!alive(session)) return;
          attempts++;
          const parsed = parseText(result.data?.text);
          const confidence = Number(result.data?.confidence) || 0;
          if (parsed.text && (!best || confidence > best.confidence)) best = { parsed, confidence, photo: compressPhoto(canvas) };
          const valid = parsed.nameConfidence >= .75 && (parsed.phone || parsed.email) && confidence >= 40;
          const identity = parsed.name.toLowerCase().replace(/\s/g, '') + '|' + (canonicalPhone(parsed.phone) || parsed.email.toLowerCase());
          if (valid) {
            stable = identity === previousIdentity ? stable + 1 : 1;
            previousIdentity = identity;
            report(session, '이름과 연락처를 확인하고 있습니다… ' + stable + '/2');
            if (stable >= 2) {
              const item = itemFor(parsed, compressPhoto(canvas));
              if (!alive(session)) return;
              const stored = await options.onResult?.(item);
              if (alive(session)) {
                if (stored) text('ocrStatus', '명함을 자동으로 읽어 저장했습니다.');
                else await draft(session, parsed, item.photo, '인식한 내용을 확인한 뒤 저장해 주세요.');
              }
              return;
            }
          } else {
            stable = 0; previousIdentity = '';
            report(session, parsed.text ? '명함 전체가 선명하게 보이도록 맞춰 주세요. 이름과 연락처를 함께 확인합니다.' : '글자가 아직 보이지 않습니다. 밝은 곳에서 명함을 가이드 안에 대 주세요.');
          }
          if (attempts >= 5 && best?.parsed.text.length >= 10) {
            await draft(session, best.parsed, best.photo, '읽은 내용 중 확인이 필요한 부분이 있습니다. 아래 이름과 연락처를 확인하고 저장해 주세요.');
            return;
          }
          if (attempts >= 10) throw new Error('명함 글자를 찾지 못했습니다. 밝은 곳에서 다시 스캔하거나 명함 사진을 불러와 주세요.');
          await bounded(new Promise(resolve => setTimeout(resolve, 650)), 1500, session.controller.signal, '다음 화면 대기');
        }
      } catch (error) {
        if (alive(session) && error.name !== 'AbortError') { const message = cameraError(error); report(session, message); options.onError?.(message); }
      } finally { finish(session); }
    }
    async function scanFile(file) {
      if (!file) return;
      if (!(file.type?.startsWith('image/') || /\.(?:jpg|jpeg|png|webp|heic|heif)$/i.test(file.name || ''))) { options.onError?.('명함 이미지 파일을 선택해 주세요.'); return; }
      if (file.size > 15 * 1024 * 1024) { options.onError?.('명함 사진은 15MB 이하로 선택해 주세요.'); return; }
      options.onNavigate?.();
      const session = begin('file');
      let photo = '';
      let parsed = parseText('');
      try {
        report(session, '명함 사진을 열고 있습니다…');
        const url = URL.createObjectURL(file);
        let bitmap;
        try {
          bitmap = await bounded(new Promise((resolve, reject) => {
            const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('사진을 열지 못했습니다. JPG 또는 PNG 사진을 선택해 주세요.')); image.src = url;
          }), 15000, session.controller.signal, '사진을 여는 시간이 초과됐습니다.');
        } finally { URL.revokeObjectURL(url); }
        if (!alive(session)) return;
        const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        photo = compressPhoto(canvas);
        await workerFor(session);
        const result = await recognize(session, canvas);
        if (!alive(session)) return;
        parsed = parseText(result.data?.text);
        if (parsed.nameConfidence >= .75 && (parsed.phone || parsed.email) && Number(result.data?.confidence) >= 45) {
          const stored = await options.onResult?.(itemFor(parsed, photo));
          if (stored) { if (alive(session)) text('ocrStatus', '명함 사진을 읽어 저장했습니다.'); return; }
        }
        await draft(session, parsed, photo, '인식한 이름과 연락처를 확인한 뒤 저장해 주세요.');
      } catch (error) {
        if (alive(session) && error.name !== 'AbortError') {
          const message = cameraError(error);
          report(session, message); options.onError?.(message);
          if (photo) await draft(session, parsed, photo, message + ' 사진은 유지되며 직접 입력할 수 있습니다.');
        }
      } finally {
        finish(session);
        if (!current && $('photo')) $('photo').value = '';
      }
    }
    global.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden && current?.kind === 'camera') stop(); });
    return { start, stop, scanFile, state: () => current ? { active: true, mode: current.kind } : { active: false, mode: null } };
  }

  global.NAMDA_SCANNER = Object.freeze({ create, parseText, cropRect, canonicalPhone, formatPhone });
})(window);
