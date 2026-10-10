/* WetlandEar: trains the small "this voice against everything else" classifier off the main thread.
   Input: positive fingerprints (your samples) and negative fingerprints (shipped with the app), all L2-normalised, 1024 numbers each.
   Plain logistic regression with balanced classes and a little L2, full-batch gradient descent. */
'use strict';
function train(P, nP, N, nN, d, iters, lr, l2) {
  var n = nP + nN, w = new Float32Array(d), b = 0, g = new Float32Array(d), i, j, it, z, p, e;
  var sp = 0.5 / nP * n, sn = 0.5 / nN * n;   /* balanced class weights */
  for (it = 0; it < iters; it++) {
    g.fill(0); var gb = 0;
    for (i = 0; i < n; i++) {
      var off, y, sw;
      if (i < nP) { off = i * d; y = 1; sw = sp; z = b; for (j = 0; j < d; j++) z += w[j] * P[off + j]; }
      else { off = (i - nP) * d; y = 0; sw = sn; z = b; for (j = 0; j < d; j++) z += w[j] * N[off + j]; }
      p = 1 / (1 + Math.exp(-z)); e = (p - y) * sw / n;
      if (i < nP) { for (j = 0; j < d; j++) g[j] += e * P[off + j]; } else { for (j = 0; j < d; j++) g[j] += e * N[off + j]; }
      gb += e;
    }
    for (j = 0; j < d; j++) w[j] -= lr * (g[j] + l2 * w[j]);
    b -= lr * gb;
  }
  return { w: w, b: b };
}
function score(m, X, k, d) { var out = new Float32Array(k), i, j, z; for (i = 0; i < k; i++) { z = m.b; for (j = 0; j < d; j++) z += m.w[j] * X[i * d + j]; out[i] = 1 / (1 + Math.exp(-z)); } return out; }
function rows(X, idx, d) { var out = new Float32Array(idx.length * d); idx.forEach(function (r, k) { out.set(X.subarray(r * d, (r + 1) * d), k * d); }); return out; }

self.onmessage = function (ev) {
  var m = ev.data, d = m.d, it = m.iters || 300, lr = m.lr || 2.0, l2 = m.l2 || 1e-3;
  if (m.type === 'train') {
    var r = train(m.P, m.nP, m.N, m.nN, d, it, lr, l2);
    /* guard: how many of the negatives does the new voice claim, and how many of its own samples does it find */
    var sn0 = score(r, m.N, m.nN, d), sp0 = score(r, m.P, m.nP, d), k0, fa0 = 0, hit0 = 0;
    for (k0 = 0; k0 < sn0.length; k0++) if (sn0[k0] >= 0.35) fa0++;
    for (k0 = 0; k0 < sp0.length; k0++) if (sp0[k0] >= 0.35) hit0++;
    self.postMessage({ type: 'trained', id: m.id, w: r.w, b: r.b, negClaim: fa0 / Math.max(1, sn0.length), selfFound: hit0 / Math.max(1, sp0.length) }, [r.w.buffer]);
  } else if (m.type === 'eval') {
    /* leave one recording out: train on the other recordings, test on the held-out one; false alarms on negatives never used for training */
    var groups = m.groups, uniq = Object.keys(groups.reduce(function (a, g) { a[g] = 1; return a; }, {})), found = 0, total = 0, fa = 0, faTotal = 0;
    var negTrain = [], negTest = [], q;
    for (q = 0; q < m.nN; q++) (q % 2 ? negTest : negTrain).push(q);
    var N1 = rows(m.N, negTrain, d), N2 = rows(m.N, negTest, d);
    uniq.forEach(function (g) {
      var tr = [], te = [], i; for (i = 0; i < groups.length; i++) (String(groups[i]) === g ? te : tr).push(i);
      if (!tr.length || !te.length) return;
      var mod = train(rows(m.P, tr, d), tr.length, N1, negTrain.length, d, it, lr, l2);
      var s = score(mod, rows(m.P, te, d), te.length, d), sn2 = score(mod, N2, negTest.length, d), k;
      for (k = 0; k < s.length; k++) if (s[k] >= 0.35) found++;
      for (k = 0; k < sn2.length; k++) if (sn2[k] >= 0.35) fa++;
      total += s.length; faTotal += sn2.length;
    });
    self.postMessage({ type: 'evaluated', id: m.id, recall: total ? found / total : null, falseAlarm: faTotal ? fa / faTotal : null, folds: uniq.length });
  }
};
