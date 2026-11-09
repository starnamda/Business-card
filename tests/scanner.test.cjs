const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../scanner.js'), 'utf8');

function fixture({ camera, worker } = {}) {
  const elements = {};
  for (const id of ['cameraBtn', 'galleryBtn', 'liveCam', 'liveVideo', 'ocrStatus', 'liveStatus', 'photo']) elements[id] = { disabled: false, hidden: true, textContent: '', srcObject: null, value: '' };
  elements.liveVideo.play = async () => {};
  elements.liveVideo.readyState = 0;
  elements.liveVideo.videoWidth = 0;
  const win = {
    isSecureContext: true,
    addEventListener() {},
    crypto: { randomUUID: () => 'test-id' },
    Tesseract: { createWorker: worker || (() => new Promise(() => {})) }
  };
  const document = {
    hidden: false,
    getElementById: id => elements[id],
    addEventListener() {},
    createElement: () => ({ getContext: () => ({}) })
  };
  const context = { window: win, document, navigator: { mediaDevices: { getUserMedia: camera || (() => new Promise(() => {})) } }, setTimeout, clearTimeout, AbortController, console };
  vm.runInNewContext(source, context);
  return { api: win.NAMDA_SCANNER, elements };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const stream = () => { const track = { stopped: false, stop() { this.stopped = true; } }; return { track, getTracks: () => [track] }; };
const worker = () => ({ stopped: false, async setParameters() {}, async terminate() { this.stopped = true; } });

test('Korean spaced full name and title are separated from organization and contacts', () => {
  const p = fixture().api.parseText('주식회사 남다\n대표이사 안 동 연\nM. 010-1234-5678\nstar@namda.biz');
  assert.equal(p.name, '안동연'); assert.equal(p.company, '주식회사 남다'); assert.equal(p.title, '대표이사');
  assert.equal(p.phone, '010-1234-5678'); assert.equal(p.email, 'star@namda.biz'); assert.ok(p.nameConfidence >= .75);
});

test('company, department, address headings and job titles are not treated as a personal name', () => {
  const p = fixture().api.parseText('주식회사 미래\n영업부\n대표이사\nTel 02-1234-5678\n서울\n구글');
  assert.equal(p.name, ''); assert.equal(p.nameConfidence, 0);
});

test('international Korean mobile format is normalized and preferred to fax', () => {
  const p = fixture().api.parseText('Kim Company Ltd.\nJohn Smith\nFAX 02-1234-5678\nMobile +82 10 7777 8888\nhello @ example.com');
  assert.equal(p.name, 'John Smith'); assert.equal(p.phone, '010-7777-8888'); assert.equal(p.email, 'hello@example.com');
});

test('ambiguous multiple people need manual review instead of automatic save', () => {
  const p = fixture().api.parseText('홍길동\n김민수\n010-1234-5678');
  assert.ok(p.nameConfidence < .75);
});

test('portrait object-fit cover crop corresponds to the actual guide bounds', () => {
  const p = fixture().api.cropRect(1920, 1080, { left: 10, top: 20, width: 300, height: 400 }, { left: 25, top: 145, width: 270, height: 150 });
  assert.ok(Math.abs(p.x - 587.4) < .01); assert.ok(Math.abs(p.y - 329.4) < .01);
  assert.ok(Math.abs(p.width - 745.2) < .01); assert.ok(Math.abs(p.height - 421.2) < .01);
});

test('cancelled permission request cannot leak a late camera stream', async () => {
  let grant;
  const f = fixture({ camera: () => new Promise(resolve => { grant = resolve; }) });
  const scanner = f.api.create({});
  const running = scanner.start(); scanner.stop();
  const late = stream(); grant(late);
  await running; await tick();
  assert.equal(late.track.stopped, true); assert.equal(scanner.state().active, false); assert.equal(f.elements.liveVideo.srcObject, null);
});

test('old scan completion never clears a newly started camera session', async () => {
  const grants = [];
  const f = fixture({ camera: () => new Promise(resolve => grants.push(resolve)) });
  const scanner = f.api.create({});
  const oldRun = scanner.start(); scanner.stop();
  const newRun = scanner.start();
  const newer = stream(); grants[1](newer);
  await tick();
  const older = stream(); grants[0](older);
  await oldRun; await tick();
  assert.equal(older.track.stopped, true); assert.equal(newer.track.stopped, false);
  assert.equal(f.elements.liveVideo.srcObject, newer); assert.equal(scanner.state().active, true);
  scanner.stop(); await newRun;
  assert.equal(newer.track.stopped, true);
});

test('an OCR worker resolving after cancellation is terminated without harming a replacement', async () => {
  const work = [];
  const f = fixture({ camera: async () => stream(), worker: () => new Promise(resolve => work.push(resolve)) });
  const scanner = f.api.create({});
  const oldRun = scanner.start(); await tick(); scanner.stop();
  const newRun = scanner.start(); await tick();
  const oldWorker = worker(); work[0](oldWorker);
  const newWorker = worker(); work[1](newWorker);
  await oldRun; await tick();
  assert.equal(oldWorker.stopped, true); assert.equal(newWorker.stopped, false); assert.equal(scanner.state().active, true);
  scanner.stop(); await newRun; assert.equal(newWorker.stopped, true);
});


test('Tesseract v5 receives Korean and English as separate language codes', async () => {
  let languageCodes, engineMode;
  const f = fixture({
    camera: async () => stream(),
    worker: async (langs, oem) => {
      languageCodes = Array.from(langs);
      engineMode = oem;
      return worker();
    }
  });
  const scanner = f.api.create({});
  const active = scanner.start();
  await tick(); await tick();
  assert.deepEqual(languageCodes, ['kor', 'eng']);
  assert.equal(engineMode, 1);
  scanner.stop();
  await active;
});
