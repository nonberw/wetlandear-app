/* WetlandEar App: neural voice (Piper) worker. Text -> phonemes (espeak-ng compiled to WebAssembly) -> VITS model in onnxruntime-web -> samples.
   Runs in a worker so the page stays responsive. Engine files are in js/vendor/piper (onnxruntime-web 1.18, MIT; piper-wasm phonemizer, MIT with espeak-ng, GPL-3). */
importScripts('vendor/piper/ort.wasm.min.js', 'vendor/piper/piper_phonemize.js');
var BASE = new URL('vendor/piper/', self.location.href).href;
ort.env.wasm.numThreads = 1;   /* one thread: no cross-origin isolation needed */
ort.env.wasm.wasmPaths = BASE;
var session = null, cfg = null, dataBuf = null, wasmBuf = null;
/* the phonemizer data (18 MB) and code are read once and handed to every phonemizer start, so a sentence does not download them again */
function engine() {
  if (dataBuf) return Promise.resolve();
  return Promise.all([fetch(BASE + 'piper_phonemize.data').then(function (r) { return r.arrayBuffer(); }), fetch(BASE + 'piper_phonemize.wasm').then(function (r) { return r.arrayBuffer(); })]).then(function (r) { dataBuf = r[0]; wasmBuf = r[1]; });
}

function phonemeIds(text) {
  return new Promise(function (resolve, reject) {
    var done = false, errs = [];
    createPiperPhonemize({
      print: function (line) { if (done) return; try { var j = JSON.parse(line); if (j && j.phoneme_ids) { done = true; resolve(j.phoneme_ids); } } catch (e) { } },
      printErr: function (m) { errs.push(m); },
      locateFile: function (u) { return BASE + u.split('/').pop(); },
      getPreloadedPackage: function () { return dataBuf; },
      wasmBinary: wasmBuf
    }).then(function (mod) {
      try { mod.callMain(['-l', cfg.espeak.voice, '--input', JSON.stringify([{ text: text }]), '--espeak_data', '/espeak-ng-data']); } catch (e) { }
      setTimeout(function () { if (!done) reject(new Error('no phonemes: ' + errs.slice(-2).join(' '))); }, 300);
    }, reject);
  });
}

onmessage = function (e) {
  var m = e.data;
  if (m.cmd === 'load') {
    cfg = JSON.parse(m.config);
    engine().then(function () { return ort.InferenceSession.create(m.model, { executionProviders: ['wasm'] }); }).then(function (s) { session = s; postMessage({ id: m.id, ok: true, rate: cfg.audio.sample_rate }); }, function (err) { postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); });
  } else if (m.cmd === 'say') {
    if (!session) { postMessage({ id: m.id, ok: false, error: 'not loaded' }); return; }
    var t0 = performance.now(), tp = 0;
    phonemeIds(m.text).then(function (ids) {
      tp = performance.now() - t0;
      var inf = cfg.inference || {}, feeds = {
        input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
        input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)])),
        scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale == null ? .667 : inf.noise_scale, (inf.length_scale == null ? 1 : inf.length_scale) * (m.slow || 1), inf.noise_w == null ? .8 : inf.noise_w]))
      };
      if (cfg.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(m.speaker || 0)]));
      return session.run(feeds);
    }).then(function (out) {
      var pcm = out.output.data; postMessage({ id: m.id, ok: true, pcm: pcm, rate: cfg.audio.sample_rate, ms: [Math.round(tp), Math.round(performance.now() - t0 - tp)] }, [pcm.buffer]);
    }, function (err) { postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); });
  }
};
