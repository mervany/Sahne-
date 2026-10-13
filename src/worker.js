const MODEL_PATH = 'fal-ai/kling-video/v2/standard/image-to-video';
const QUEUE_BASE = 'https://queue.fal.run';
const APP_BASE   = 'fal-ai/kling-video';
const CLAUDE_MODEL = 'claude-sonnet-5-5';

const TUR = {
  anime:  'anime / animasyon sahnesi',
  film:   'kısa film sahnesi',
  reklam: 'ürün reklam videosu',
};

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
      });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);

    try {
      if (!env.FAL_KEY) return json({ error: 'FAL_KEY tanımlı değil. Worker ayarlarından ekle.' }, 500);

      if (url.pathname === '/generate' && request.method === 'POST') {
        return json(await startJob(await request.json(), env));
      }
      if (url.pathname === '/status' && request.method === 'GET') {
        return json(await checkJob(url.searchParams.get('id'), env));
      }
      if (url.pathname === '/') {
        return json({ ok: true, hint: 'POST /generate · GET /status?id=...' });
      }
      return json({ error: 'Bilinmeyen adres: ' + url.pathname }, 404);
    } catch (e) {
      return json({ error: e.message || 'Beklenmeyen hata' }, 500);
    }
  },
};

async function startJob(body, env) {
  const {
    kind = 'reklam', subject = '', action = '', styles = [],
    ratio = '9:16', duration = 5, image = '', note = '',
  } = body || {};

  if (!image)   throw new Error('Kaynak görsel gelmedi.');
  if (!subject) throw new Error('Konu alanı boş.');

  const prompt = await writePrompt({ kind, subject, action, styles, note }, env);

  const res = await fetch(`${QUEUE_BASE}/${MODEL_PATH}`, {
    method: 'POST',
    headers: { Authorization: `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image_url: image,
      duration: String(duration),
      aspect_ratio: ratio,
      negative_prompt: 'blur, distort, warped text, deformed logo, low quality, watermark',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`fal.ai reddetti (${res.status}): ${data.detail || data.error || 'ayrıntı yok'}`);
  if (!data.request_id) throw new Error('fal.ai iş numarası döndürmedi.');

  return { id: data.request_id, prompt };
}

async function writePrompt({ kind, subject, action, styles, note }, env) {
  const yerel = fallbackPrompt({ kind, subject, action, styles, note });
  if (!env.ANTHROPIC_KEY) return yerel;

  const soru = [
    `Bir ${TUR[kind] || TUR.reklam} için video üretim modeline verilecek prompt yazıyorsun.`,
    `Konu: ${subject}`,
    action ? `Olması istenen: ${action}` : null,
    styles.length ? `Stil: ${styles.join(', ')}` : null,
    note ? `B
