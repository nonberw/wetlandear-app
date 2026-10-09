"""WetlandEar species suggestions. POST JSON: {lat, lon, windows: [base64 int16 PCM, 48 kHz mono, 3 s each]}.
Returns the top species per window. The result is a suggestion: a person confirms it in the app."""
from http.server import BaseHTTPRequestHandler
import base64
import csv
import json
import os
import time
import urllib.request
import numpy as np
from ai_edge_litert.interpreter import Interpreter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models')
SAMPLES = 144000
MAX_WINDOWS = 12
DEFAULT_LAT, DEFAULT_LON = 50.6, 69.0   # Korgalzhyn
SUPABASE_URL = 'https://vflyedmortnampzdenpf.supabase.co'
SUPABASE_KEY = 'sb_publishable_PnI4L7VszIqaFrWHnvbHRg_dyB3ZeVn'   # public by design
_state = {}
_tokens = {}   # token -> expiry, so a burst of requests checks the account only once


def signed_in(token):
    """True if the token belongs to a real signed-in user (asked of Supabase Auth)."""
    if not token or len(token) > 4000:
        return False
    now = time.time()
    if _tokens.get(token, 0) > now:
        return True
    req = urllib.request.Request(SUPABASE_URL + '/auth/v1/user', headers={'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(req, timeout=6) as r:
            ok = r.status == 200
    except Exception:
        ok = False
    if ok:
        if len(_tokens) > 500:
            _tokens.clear()
        _tokens[token] = now + 120
    return ok


def _load():
    if _state:
        return _state
    with open(os.path.join(ROOT, 'birdnet_v2.4_labels.txt'), encoding='utf-8') as f:
        labels = [l.strip() for l in f if l.strip()]
    clf = Interpreter(model_path=os.path.join(ROOT, 'birdnet_v2.4_fp16.tflite'))
    clf.allocate_tensors()
    meta = Interpreter(model_path=os.path.join(ROOT, 'birdnet_v2.4_meta_fp16.tflite'))
    meta.allocate_tensors()
    yam = Interpreter(model_path=os.path.join(ROOT, 'yamnet.tflite'))
    yam.allocate_tensors()
    with open(os.path.join(ROOT, 'yamnet_class_map.csv'), encoding='utf-8') as f:
        names = [r['display_name'] for r in csv.DictReader(f)]
    _state.update(labels=labels, clf=clf, meta=meta, yam=yam, ynames=names, groups=_groups(names))
    return _state


def _idx(names, *wanted):
    return [i for i, n in enumerate(names) if n in wanted]


def _groups(names):
    """Sound classes of YAMNet grouped into what matters for a wetland reserve."""
    return {
        'animal': _idx(names, 'Animal', 'Wild animals', 'Bird', 'Bird vocalization, bird call, bird song', 'Bird flight, flapping wings', 'Frog',
                       'Insect', 'Cricket', 'Chirp, tweet', 'Squawk', 'Owl', 'Crow', 'Caw', 'Duck', 'Goose', 'Quack', 'Honk', 'Pigeon, dove', 'Coo', 'Hoot', 'Turkey', 'Gobble'),
        'weather': _idx(names, 'Wind', 'Wind noise (microphone)', 'Rain', 'Raindrop', 'Rain on surface', 'Thunderstorm', 'Thunder', 'Rustling leaves', 'Stream', 'Waves, surf'),
        'speech': _idx(names, 'Speech', 'Child speech, kid speaking', 'Conversation', 'Hubbub, speech noise, speech babble', 'Shout', 'Yell', 'Laughter'),
        'gun': _idx(names, 'Gunshot, gunfire', 'Machine gun', 'Fusillade', 'Artillery fire', 'Explosion', 'Cap gun'),
        'engine': _idx(names, 'Engine', 'Light engine (high frequency)', 'Medium engine (mid frequency)', 'Heavy engine (low frequency)', 'Motor vehicle (road)',
                       'Motorboat, speedboat', 'Motorcycle', 'Chainsaw', 'Lawn mower', 'Engine knocking', 'Idling', 'Accelerating, revving, vroom'),
        'dog': _idx(names, 'Dog', 'Bark', 'Howl', 'Canidae, dogs, wolves'),
    }


def _run(interp, x):
    i = interp.get_input_details()[0]
    o = interp.get_output_details()[0]
    interp.set_tensor(i['index'], x)
    interp.invoke()
    return interp.get_tensor(o['index'])[0].copy()


def sound_type(window):
    """What kind of sound is at the center of a 3 s window (YAMNet, 0.975 s at 16 kHz)."""
    s = _load()
    x16 = window.reshape(-1, 3).mean(axis=1).astype('float32')       # 48 kHz -> 16 kHz
    c = len(x16) // 2
    seg = x16[c - 7800:c + 7800]
    scores = _run(s['yam'], seg)
    top = np.argsort(-scores)[:3]
    g = {k: round(float(scores[v].max()), 3) if v else 0.0 for k, v in s['groups'].items()}
    return {'top': [{'name': s['ynames'][i], 'score': round(float(scores[i]), 3)} for i in top if scores[i] >= 0.1], 'groups': g}


def identify(windows, lat, lon):
    s = _load()
    # Species that can plausibly occur at this place (the meta model is location only, not seasonal).
    plausible = _run(s['meta'], np.array([[lat, lon, 1.0]], dtype='float32')) > 0.03
    out = []
    for w in windows:
        logits = _run(s['clf'], w.reshape(1, SAMPLES))
        conf = 1.0 / (1.0 + np.exp(-np.clip(logits, -15, 15)))
        conf = np.where(plausible, conf, 0.0)
        top = np.argsort(-conf)[:5]
        snd = sound_type(w)
        items = []
        for k in top:
            if conf[k] < 0.05:
                continue
            sci, _, common = s['labels'][k].partition('_')
            items.append({'sci': sci, 'common': common, 'conf': round(float(conf[k]), 3)})
        out.append({'species': items, 'sound': snd})
    return out


class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            auth = self.headers.get('Authorization', '')
            if not auth.startswith('Bearer ') or not signed_in(auth[7:].strip()):
                return self._send(401, {'error': 'sign in required'})
            n = int(self.headers.get('Content-Length', '0'))
            if n <= 0 or n > 4_000_000:
                return self._send(413, {'error': 'body size'})
            req = json.loads(self.rfile.read(n))
            raw = req.get('windows') or []
            if not isinstance(raw, list) or not raw or len(raw) > MAX_WINDOWS:
                return self._send(400, {'error': 'windows'})
            lat = float(req.get('lat') if req.get('lat') is not None else DEFAULT_LAT)
            lon = float(req.get('lon') if req.get('lon') is not None else DEFAULT_LON)
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                return self._send(400, {'error': 'coords'})
            wins = []
            for b in raw:
                pcm = np.frombuffer(base64.b64decode(b), dtype='<i2')
                if pcm.size != SAMPLES:
                    return self._send(400, {'error': 'window length'})
                wins.append((pcm.astype('float32') / 32768.0))
            return self._send(200, {'model': 'BirdNET V2.4', 'results': identify(wins, lat, lon)})
        except Exception:
            return self._send(500, {'error': 'identify failed'})

    def do_GET(self):
        return self._send(200, {'ok': True, 'model': 'BirdNET V2.4'})
