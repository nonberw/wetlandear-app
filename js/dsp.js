/* WetlandEar signal processing. Plain JS, no dependencies.
   Decode -> mono 22.05 kHz -> spectrogram -> acoustic event detection.
   This finds WHERE something sounds like a call. It does not name the species. */
(function () {
  'use strict';
  var SR = 22050, NFFT = 1024, HOP = 512, BINHZ = SR / NFFT;
  var FMIN = 800, FMAX = 10000;
  var B0 = Math.round(FMIN / BINHZ), B1 = Math.round(FMAX / BINHZ), NB = B1 - B0;

  var win = new Float32Array(NFFT), cosT = new Float32Array(NFFT / 2), sinT = new Float32Array(NFFT / 2), rev = new Uint16Array(NFFT);
  (function init() {
    var i, bits = Math.log2(NFFT);
    for (i = 0; i < NFFT; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (NFFT - 1));
    for (i = 0; i < NFFT / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / NFFT); sinT[i] = -Math.sin(2 * Math.PI * i / NFFT); }
    for (i = 0; i < NFFT; i++) { var r = 0, x = i; for (var b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  })();

  function fft(re, im) {
    var n = NFFT, i, j, k, size, half, step, a, b, tr, ti;
    for (i = 0; i < n; i++) { j = rev[i]; if (j > i) { tr = re[i]; re[i] = re[j]; re[j] = tr; ti = im[i]; im[i] = im[j]; im[j] = ti; } }
    for (size = 2; size <= n; size <<= 1) {
      half = size >> 1; step = n / size;
      for (i = 0; i < n; i += size) {
        for (j = i, k = 0; j < i + half; j++, k += step) {
          a = j + half;
          tr = re[a] * cosT[k] - im[a] * sinT[k];
          ti = re[a] * sinT[k] + im[a] * cosT[k];
          re[a] = re[j] - tr; im[a] = im[j] - ti;
          re[j] += tr; im[j] += ti;
        }
      }
    }
  }

  /* Any audio file or blob -> Float32Array mono at 22.05 kHz */
  function decode(arrayBuffer, rate) {
    var R = rate || SR;
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = new AC();
    return new Promise(function (res, rej) { ctx.decodeAudioData(arrayBuffer, res, rej); }).then(function (buf) {
      var len = Math.max(1, Math.ceil(buf.duration * R));
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var off = new OAC(1, len, R), src = off.createBufferSource();
      src.buffer = buf; src.connect(off.destination); src.start();
      return new Promise(function (res2, rej2) {
        var p = off.startRendering(Promise);
        if (p && p.then) p.then(res2, rej2); else off.oncomplete = function (e) { res2(e.renderedBuffer); };
      });
    }).then(function (out) { try { ctx.close(); } catch (e) { } return out.getChannelData(0); });
  }

  /* STFT -> dB frames over FMIN..FMAX, smoothed, plus per-bin noise floor */
  function spectrogram(samples) {
    var F = Math.max(0, Math.floor((samples.length - NFFT) / HOP) + 1);
    var db = new Float32Array(F * NB), re = new Float32Array(NFFT), im = new Float32Array(NFFT);
    var f, i, o;
    for (f = 0; f < F; f++) {
      o = f * HOP;
      for (i = 0; i < NFFT; i++) { re[i] = samples[o + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (i = 0; i < NB; i++) {
        var k = B0 + i, p = re[k] * re[k] + im[k] * im[k];
        db[f * NB + i] = 10 * Math.log10(p + 1e-12);
      }
    }
    /* light smoothing: 3 bins across frequency, 3 frames across time */
    var tmp = new Float32Array(db.length);
    for (f = 0; f < F; f++) for (i = 0; i < NB; i++) {
      var a = db[f * NB + Math.max(0, i - 1)], b = db[f * NB + i], c = db[f * NB + Math.min(NB - 1, i + 1)];
      tmp[f * NB + i] = (a + 2 * b + c) / 4;
    }
    var sm = new Float32Array(db.length);
    for (f = 0; f < F; f++) for (i = 0; i < NB; i++) {
      var p0 = tmp[Math.max(0, f - 1) * NB + i], p1 = tmp[f * NB + i], p2 = tmp[Math.min(F - 1, f + 1) * NB + i];
      sm[f * NB + i] = (p0 + 2 * p1 + p2) / 4;
    }
    /* noise floor: 25th percentile per bin on a time subsample */
    var floor = new Float32Array(NB), step = Math.max(1, Math.floor(F / 600)), col = [];
    for (i = 0; i < NB; i++) {
      col.length = 0;
      for (f = 0; f < F; f += step) col.push(sm[f * NB + i]);
      col.sort(function (x, y) { return x - y; });
      floor[i] = col.length ? col[Math.floor(col.length * .25)] : -120;
    }
    return { db: sm, floor: floor, frames: F, bins: NB, hop: HOP, sr: SR, binHz: BINHZ, fmin: B0 * BINHZ, fmax: B1 * BINHZ, dur: samples.length / SR };
  }

  /* Event detection. sens: required SNR in dB (lower = more sensitive). */
  function detect(sp, snrDb) {
    var F = sp.frames, NBn = sp.bins, T = snrDb, ex = new Float32Array(F), f, i;
    var TOPK = 6, top = new Float32Array(TOPK);
    for (f = 0; f < F; f++) {
      for (i = 0; i < TOPK; i++) top[i] = -999;
      for (i = 0; i < NBn; i++) {
        var v = sp.db[f * NBn + i] - sp.floor[i];
        if (v > top[TOPK - 1]) {
          var j = TOPK - 1; while (j > 0 && top[j - 1] < v) { top[j] = top[j - 1]; j--; } top[j] = v;
        }
      }
      var s = 0; for (i = 0; i < TOPK; i++) s += top[i];
      ex[f] = s / TOPK;
    }
    var events = [], on = false, start = 0, gap = 0, lo = T * .75, GAP = 5, MINF = 4, MAXF = Math.round(8 * SR / HOP);
    function close(end) {
      var len = end - start + 1;
      if (len < MINF || len > MAXF) return;
      var acc = new Float32Array(NBn), peak = 0, sum = 0;
      for (var ff = start; ff <= end; ff++) { sum += ex[ff]; for (var b = 0; b < NBn; b++) acc[b] += Math.max(0, sp.db[ff * NBn + b] - sp.floor[b]); }
      var best = 0; for (var bb = 0; bb < NBn; bb++) if (acc[bb] > acc[best]) best = bb;
      var cut = acc[best] * .35, bLo = best, bHi = best;
      while (bLo > 0 && acc[bLo - 1] > cut) bLo--;
      while (bHi < NBn - 1 && acc[bHi + 1] > cut) bHi++;
      events.push({
        t0: start * HOP / SR, t1: (end + 1) * HOP / SR + NFFT / SR * .5,
        fLow: Math.round(sp.fmin + bLo * BINHZ), fHigh: Math.round(sp.fmin + (bHi + 1) * BINHZ),
        fPeak: Math.round(sp.fmin + best * BINHZ), snr: Math.round(sum / len * 10) / 10
      });
    }
    for (f = 0; f < F; f++) {
      if (!on) { if (ex[f] > T) { on = true; start = f; gap = 0; } }
      else if (ex[f] > lo) { gap = 0; }
      else { gap++; if (gap > GAP) { close(f - gap); on = false; } }
    }
    if (on) close(F - 1 - gap);
    return events;
  }

  function describe(ev) {
    var bw = ev.fHigh - ev.fLow;
    if (bw < 1200) return 'тональный свист';
    if (bw > 4000) return 'широкополосный крик';
    return 'модулированный звук';
  }

  function wavBlob(samples, sr) {
    var n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), i;
    function s(o, t) { for (var k = 0; k < t.length; k++) v.setUint8(o + k, t.charCodeAt(k)); }
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    for (i = 0; i < n; i++) { var x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 32768 : x * 32767, true); }
    return new Blob([buf], { type: 'audio/wav' });
  }

  window.WEDSP = { SR: SR, HOP: HOP, decode: decode, spectrogram: spectrogram, detect: detect, describe: describe, wavBlob: wavBlob };
})();
