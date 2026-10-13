const M='fal-ai/kling-video/v2/standard/image-to-video',Q='https://queue.fal.run',A='fal-ai/kling-video';
const H={anime:'anime sahnesi',film:'kisa film sahnesi',reklam:'urun reklam videosu'};
const L={anime:'anime style, cel-shaded, expressive motion',film:'cinematic, filmic grain, shallow depth of field',reklam:'commercial product shot, clean studio lighting'};
const C={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'};
const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{...C,'Content-Type':'application/json; charset=utf-8'}});

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: C });
    const u = new URL(req.url);
    try {
      if (!env.FAL_KEY) return J({ error: 'FAL_KEY yok' }, 500);
      if (u.pathname === '/generate' && req.method === 'POST') return J(await start(await req.json(), env));
      if (u.pathname === '/status') return J(await check(u.searchParams.get('id'), env));
      return J({ ok: true });
    } catch (e) { return J({ error: e.message || 'hata' }, 500); }
  }
};

async function start(b, env) {
  const kind = b.kind || 'reklam';
  if (!b.image) throw new Error('Gorsel gelmedi.');
  if (!b.subject) throw new Error('Konu bos.');
  const p = await writePrompt(b, kind, env);
  const r = await fetch(Q + '/' + M, {
    method: 'POST',
    headers: { Authorization: 'Key ' + env.FAL_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: p, image_url: b.image, duration: String(b.duration || 5), aspect_ratio: b.ratio || '9:16', negative_prompt: 'blur, distort, warped text, deformed logo, low quality, watermark' })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('fal.ai reddetti (' + r.status + '): ' + (d.detail || d.error || '?'));
  if (!d.request_id) throw new Error('is numarasi gelmedi');
  return { id: d.request_id, prompt: p };
}

function local(b, kind) {
  return [b.subject + '.', b.action || 'Subtle, natural motion.', (b.styles || []).join(', '), b.note || '', (L[kind] || '') + ', smooth camera movement, high detail, stable subject.'].filter(Boolean).join(' ');
}

async function writePrompt(b, kind, env) {
  const y = local(b, kind);
  if (!env.ANTHROPIC_KEY) return y;
  const q = 'Bir ' + (H[kind] || H.reklam) + ' icin image-to-video promptu yaziyorsun.\nKonu: ' + b.subject + '\nIstenen: ' + (b.action || '-') + '\nStil: ' + ((b.styles || []).join(', ') || '-') + '\nEk not: ' + (b.note || '-') + '\nBunu Ingilizce tek paragraf 60-90 kelimelik bir prompta cevir. Kamera hareketi, isik, atmosfer ve tempo belirt. Kaynak gorseldeki urun/karakter aynen korunmali. Sadece prompt metnini dondur.';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 400, messages: [{ role: 'user', content: q }] })
    });
    if (!r.ok) return y;
    const d = await r.json();
    const t = d && d.content && d.content[0] ? String(d.content[0].text).trim() : '';
    return t.length > 20 ? t : y;
  } catch (e) { return y; }
}

async function check(id, env) {
  if (!id || !/^[A-Za-z0-9_-]{6,80}$/.test(id)) throw new Error('Gecersiz is numarasi.');
  const h = { Authorization: 'Key ' + env.FAL_KEY };
  const sr = await fetch(Q + '/' + A + '/requests/' + id + '/status', { headers: h });
  const s = await sr.json().catch(() => ({}));
  if (!sr.ok) throw new Error('Durum sorgusu basarisiz (' + sr.status + ')');
  if (s.status === 'COMPLETED') {
    const rr = await fetch(Q + '/' + A + '/requests/' + id, { headers: h });
    const o = await rr.json().catch(() => ({}));
    const link = (o.video && o.video.url) || (o.videos && o.videos[0] && o.videos[0].url) || o.url;
    if (!link) throw new Error('Video adresi gelmedi.');
    return { status: 'done', url: link };
  }
  if (s.status === 'IN_QUEUE') return { status: 'queued', position: s.queue_position };
  if (s.status === 'IN_PROGRESS') return { status: 'running' };
  throw new Error('Uretim basarisiz: ' + (s.error || s.status || '?'));
}
