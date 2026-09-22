// scripts/verify-groq-key.mjs
//
// Live sanity check for the Groq brain (src/lib/ai/groq-brain.ts). Run this ONCE
// after setting GROQ_API_KEY, before trusting the curator / homepage rotation /
// X ranking to it — and again whenever you change GROQ_BRAIN_MODEL_FAST/SMART.
//
// Why it exists: the brain's tests fake the router and Redis (CI has no path to
// api.groq.com), so nothing automated proves the request we really send is
// accepted. This sends the SAME request shape provider-router.ts builds for the
// groq provider (max_tokens, response_format json_object, reasoning_effort:low on
// gpt-oss) to each model and reports, per model:
//   - does the model exist for your account? (404 => set GROQ_BRAIN_MODEL_FAST/SMART)
//   - are the request parameters accepted? (400 => wire-format problem; see below)
//   - is the reply valid JSON in the curator's shape?
//   - how many tokens did the call really cost? (calibrates est-vs-actual in the governor)
//   - what limits does Groq apply to you? (x-ratelimit-* headers)
//
// Usage (Node 20.6+):
//   node --env-file=.env.local scripts/verify-groq-key.mjs   (or: npm run verify:groq)
//
// Cost: 2-4 tiny requests (~2K tokens each) — a rounding error on the free tier.

const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error('FAIL  GROQ_API_KEY is not set in this shell/environment.');
  console.error('      Create a key (no card needed) at https://console.groq.com/keys, then:');
  console.error('      node --env-file=.env.local scripts/verify-groq-key.mjs');
  process.exit(1);
}

const models = [...new Set([
  process.env.GROQ_BRAIN_MODEL_FAST || 'openai/gpt-oss-20b',
  process.env.GROQ_BRAIN_MODEL_SMART || 'openai/gpt-oss-120b',
])];

// GROQ_VERIFY_ENDPOINT exists only so this script's own logic can be tested against a local stub.
const ENDPOINT = process.env.GROQ_VERIFY_ENDPOINT ?? 'https://api.groq.com/openai/v1/chat/completions';

// A miniature of the real curator prompt (see buildPrompt in ai-curator.ts).
const system =
  'You are a companion-recommendation curator for an AI character chat app. ' +
  'Return the shortlist reordered so the character most likely to appeal comes first. ' +
  'Write one short reason (under 8 words) for the first 2 only. ' +
  'Respond with ONLY minified JSON, no prose, no code fences, in exactly this shape: ' +
  '{"order":[{"n":<n>,"reason":"<reason, first 2 only>"},{"n":<n>}]} ' +
  'The "order" array MUST contain every n from the input exactly once, no more, no fewer, no invented ns.';

const user = JSON.stringify({
  tasteSummary: ['romance', 'slow burn'],
  shortlist: [
    { n: 1, name: 'Aria Vale',   arch: 'The Sage',      tags: ['cozy', 'fantasy'] },
    { n: 2, name: 'Kaito Mori',  arch: 'The Rebel',      tags: ['banter', 'romance'] },
    { n: 3, name: 'Selene Ash',  arch: 'The Rival',      tags: ['slow burn', 'gothic'] },
    { n: 4, name: 'Dante Reyes', arch: 'The Trickster',  tags: ['adventure'] },
    { n: 5, name: 'Mira Okon',   arch: 'The Caregiver',  tags: ['comfort', 'cozy'] },
  ],
});

let failures = 0;

for (const model of models) {
  console.log(`\n── ${model}`);
  const isReasoning = /gpt-oss/i.test(model);
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: 1200, // what provider-router.ts sends (groq-brain's curator calls)
    temperature: 0.4,
    response_format: { type: 'json_object' },
    ...(isReasoning ? { reasoning_effort: 'low' } : {}),
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    failures++;
    console.log(`  FAIL  network error: ${err.message}`);
    continue;
  }

  const text = await res.text();
  if (!res.ok) {
    failures++;
    console.log(`  FAIL  HTTP ${res.status}: ${text.slice(0, 300)}`);
    if (res.status === 401) console.log('        -> key rejected. Re-create it at console.groq.com/keys');
    if (res.status === 404) console.log('        -> model unavailable to you. Set GROQ_BRAIN_MODEL_FAST/SMART to a model your account can access.');
    if (res.status === 400) {
      console.log('        -> a request parameter was rejected. Retrying with max_completion_tokens instead of max_tokens...');
      const { max_tokens, ...rest } = body;
      const retry = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, max_completion_tokens: max_tokens }),
      }).catch(() => null);
      if (retry?.ok) console.log('        -> WORKS with max_completion_tokens: provider-router.ts needs updating for this model.');
      else console.log(`        -> still HTTP ${retry?.status ?? 'error'}: the problem is not the token-limit param name.`);
    }
    if (res.status === 429) console.log('        -> rate limited (already spent today\'s allowance testing this).');
    continue;
  }

  let data;
  try { data = JSON.parse(text); } catch { failures++; console.log('  FAIL  non-JSON HTTP body'); continue; }

  const content = data.choices?.[0]?.message?.content ?? '';
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '').trim();
  const usage = data.usage ?? {};

  let parsed = null;
  try { parsed = JSON.parse(cleaned); } catch { /* reported below */ }

  const order = Array.isArray(parsed?.order) ? parsed.order.map(o => o?.n) : null;
  const validPerm = order && order.length === 5 && new Set(order).size === 5 &&
    order.every(n => Number.isInteger(n) && n >= 1 && n <= 5);

  console.log(`  HTTP 200  tokens: prompt=${usage.prompt_tokens ?? '?'} completion=${usage.completion_tokens ?? '?'} total=${usage.total_tokens ?? '?'}`);
  if (usage.completion_tokens_details?.reasoning_tokens != null) {
    console.log(`            reasoning tokens: ${usage.completion_tokens_details.reasoning_tokens}`);
  }
  console.log(`  reply: ${cleaned.slice(0, 160).replace(/\s+/g, ' ')}${cleaned.length > 160 ? '…' : ''}`);

  if (!cleaned) {
    failures++;
    console.log('  FAIL  empty content (hidden reasoning may have consumed max_tokens)');
  } else if (!parsed) {
    failures++;
    console.log('  FAIL  reply is not valid JSON');
  } else if (!validPerm) {
    console.log('  WARN  valid JSON but not an exact permutation of 1..5 — the curator strict-gate would discard this reply');
  } else {
    console.log('  PASS  JSON mode + reasoning_effort + max_tokens all accepted; ranking is a valid permutation');
  }

  // Whatever Groq reports as YOUR limits for this model.
  const limits = [...res.headers.entries()].filter(([k]) => k.startsWith('x-ratelimit'));
  if (limits.length) {
    console.log('  your limits (from response headers):');
    for (const [k, v] of limits) console.log(`    ${k}: ${v}`);
  }
}

console.log('\n' + (failures === 0
  ? 'ALL MODELS OK. The governor defaults (GROQ_PLAN=free) assume 25 req/min, 900 req/day, 7K tokens/min, 170K tokens/day per model — adjust GROQ_*_LIMIT env vars if console.groq.com shows different numbers for your account.'
  : `${failures} model(s) FAILED — fix GROQ_BRAIN_MODEL_FAST / GROQ_BRAIN_MODEL_SMART or the request shape above before trusting the curator to this key.`));
process.exit(failures === 0 ? 0 : 1);
