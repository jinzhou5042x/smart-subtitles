// Official Sign in with ChatGPT / Responses flow. Credentials live only in this worker's memory.
import { createLocalJWKSet, jwtVerify } from 'jose';
import { subtitleInstructions, subtitlePrompt, parseModelSegments } from './translation.js';
import { PRIVATE_REQUEST, readJSON } from './network.js';

export const AUTH_ORIGIN = 'https://auth.openai.com';
export const API_ORIGIN = 'https://api.openai.com';
export const CALLBACK = 'http://127.0.0.1:1455/auth/callback';
export const DEFAULT_MODEL = 'gpt-6-luna';
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const RESOURCE = `${API_ORIGIN}/v1`;
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
const TERMINAL_REFRESH = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']);
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const fail = (message, code = '', status = 0) => Object.assign(new Error(message), { code, status, needsUser: true });
const safeCode = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : '';

function apiError(status, data, fallback) {
  const code = safeCode(data?.error?.code || data?.error);
  const messages = {
    subscription_sharing_user_not_eligible: 'ChatGPT plan usage is not available for this account or workspace.',
    subscription_sharing_usage_limit_exceeded: 'ChatGPT usage limit reached. Open Manage usage in Translator settings.',
    subscription_sharing_usage_unavailable: 'ChatGPT usage could not be checked. Try again later.',
    subscription_sharing_route_not_supported: 'OpenAI has not enabled this request route for this connection.',
    subscription_sharing_unsupported_capability: 'This model or request is not supported by your ChatGPT plan connection.',
    chatpass_v2_scope_not_authorized: 'This connection does not have permission to use your ChatGPT plan.',
    chatpass_v2_invalid_authorization_context: 'OpenAI did not accept this ChatGPT authorization. Sign in again.',
  };
  return fail(messages[code] || `${fallback} (HTTP ${status}${code ? `, ${code}` : ''}).`, code, status);
}

export class ChatGPTClient {
  #tokens = new Map(); #pending = null; #refreshes = new Map(); #keys = null; #discovery = null;
  constructor({ metadata = {}, fetcher = fetch, now = Date.now } = {}) {
    this.fetcher = fetcher; this.now = now;
    this.hostId = metadata.hostId || `urn:uuid:${crypto.randomUUID()}`;
    this.active = metadata.active || '';
    this.accounts = new Map((metadata.accounts || []).map(a => [a.id, { id: a.id, subject: a.subject || '', email: a.email || '', model: a.model || DEFAULT_MODEL, welcomed: !!a.welcomed }]));
  }
  metadata() { return { hostId: this.hostId, active: this.active, accounts: [...this.accounts.values()] }; }
  status() {
    return { active: this.active, pending: !!this.#pending, login: this.#pending ? { phase: this.#pending.exchanging ? 'verifying' : 'waiting', tabId: this.#pending.tabId } : null, accounts: [...this.accounts.values()].map(a => {
      const token = this.#tokens.get(a.id), models = token?.models || [];
      const connected = !!token, sharing = !!token?.scopes.includes(PLAN_SCOPE);
      return { ...a, connected, sharing, models, ready: sharing && models.some(m => m.slug === a.model) };
    }) };
  }
  async json(url, options = {}) {
    let response;
    try { response = await this.fetcher(url, { ...options, ...PRIVATE_REQUEST, signal: options.signal || AbortSignal.timeout(15000) }); }
    catch (e) { if (options.signal?.aborted) throw e; throw fail('Could not reach OpenAI. Check your connection and try again.'); }
    const data = await readJSON(response);
    if (!response.ok) throw apiError(response.status, data, 'OpenAI request failed');
    return data;
  }
  async verify(idToken, clientId, nonce) {
    // Refresh once when keys rotate; never use a key URL from an unverified JWT.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.#keys) this.#keys = createLocalJWKSet(await this.json(`${AUTH_ORIGIN}/.well-known/jwks.json`));
      try {
        const { payload } = await jwtVerify(idToken, this.#keys, { issuer: AUTH_ORIGIN, audience: clientId, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5, currentDate: new Date(this.now()) });
        if (typeof payload.sub !== 'string' || !payload.sub || (nonce !== undefined && payload.nonce !== nonce)) throw new Error('Invalid identity');
        return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email.slice(0, 320) : '' };
      } catch (e) {
        if (attempt === 0 && e.code === 'ERR_JWKS_NO_MATCHING_KEY') { this.#keys = null; continue; }
        throw fail('Could not verify the OpenAI sign-in. Start sign-in again.');
      }
    }
  }
  async begin({ tabId, accountId = '', enablePlan = false }) {
    this.cancel();
    const account = accountId ? this.accounts.get(accountId) : null;
    if (accountId && !account) throw fail('Choose a saved ChatGPT account or add a new one.');
    const attempt = { tabId, accountId, state: random(), nonce: random(), verifier: random(), expires: this.now() + 10 * 60000, controller: new AbortController() };
    this.#pending = attempt;
    const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(attempt.verifier))));
    if (this.#pending !== attempt) throw fail('Sign-in cancelled.');
    const query = new URLSearchParams({ client_id: accountId || 'dynamic_agent_client', ext_agent_host_id: this.hostId, response_type: 'code', redirect_uri: CALLBACK, scope: SCOPES, resource: RESOURCE, state: attempt.state, nonce: attempt.nonce, code_challenge_method: 'S256', code_challenge: challenge });
    if (!account) query.set('agent_name_hint', 'Smart Subtitles');
    if (account?.email) query.set('login_hint', account.email);
    // Do not put an ID token into a browser URL/history. OpenAI supports login_hint alone.
    if (enablePlan) query.set('prompt', 'consent');
    return { url: `${AUTH_ORIGIN}/api/accounts/authorize?${query}`, tabId };
  }
  cancel(tabId) {
    if (this.#pending && (tabId === undefined || this.#pending.tabId === tabId)) { this.#pending.controller.abort(); this.#pending = null; return true; }
    return false;
  }
  async finish({ tabId, code, state, clientId, error }) {
    const attempt = this.#pending;
    if (!attempt || attempt.tabId !== tabId || attempt.state !== state || attempt.expires < this.now() || attempt.exchanging) throw fail('This sign-in is expired or does not match. Start sign-in again.');
    if (error) { this.cancel(); throw fail(error === 'access_denied' ? 'ChatGPT sign-in was cancelled. You can continue with another translator.' : 'OpenAI could not complete sign-in. Try again.'); }
    const id = clientId || attempt.accountId;
    if (!id || id === 'dynamic_agent_client' || !/^[a-zA-Z0-9_-]{1,200}$/.test(id) || (attempt.accountId && id !== attempt.accountId)) throw fail('OpenAI returned an unexpected account registration.');
    if (typeof code !== 'string' || !code || code.length > 12000) throw fail('OpenAI did not return a valid authorization code.');
    attempt.exchanging = true;
    // Retain the issued ID even if a one-time authorization code expires during exchange.
    const previous = this.accounts.get(id);
    if (!previous) this.accounts.set(id, { id, subject: '', email: '', model: DEFAULT_MODEL, welcomed: false });
    try {
      const data = await this.json(`${AUTH_ORIGIN}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: id, code, code_verifier: attempt.verifier, redirect_uri: CALLBACK, resource: RESOURCE }), signal: AbortSignal.any([attempt.controller.signal, AbortSignal.timeout(20000)]) });
      const identity = await this.verify(data.id_token, id, attempt.nonce);
      if (previous?.subject && previous.subject !== identity.subject) throw fail('Sign-in returned a different ChatGPT account. Add it as a new account instead.');
      attempt.controller.signal.throwIfAborted();
      const token = this.tokenSet(data);
      this.accounts.set(id, { ...this.accounts.get(id), ...identity });
      this.#tokens.set(id, token); this.active = id;
      if (token.scopes.includes(PLAN_SCOPE)) await this.models(id);
      return this.status();
    } finally { if (this.#pending === attempt) this.#pending = null; }
  }
  tokenSet(data, previous) {
    if (typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 32000 || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 86400) throw fail('OpenAI returned incomplete credentials. Sign in again.');
    if ((data.token_type !== undefined && (typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer')) || /[\r\n]/.test(data.access_token) || (data.refresh_token !== undefined && (typeof data.refresh_token !== 'string' || !data.refresh_token || data.refresh_token.length > 32000 || /[\r\n]/.test(data.refresh_token)))) throw fail('OpenAI returned invalid credentials. Sign in again.');
    return { access: data.access_token, refresh: typeof data.refresh_token === 'string' ? data.refresh_token : previous?.refresh, idToken: data.id_token || previous?.idToken, scopes: typeof data.scope === 'string' ? data.scope.split(/\s+/) : previous?.scopes || [], expires: this.now() + data.expires_in * 1000, models: previous?.models || [] };
  }
  async access(id) {
    const token = this.#tokens.get(id);
    if (!token) throw fail('Sign in with ChatGPT in Translator settings. Sign-in lasts until Chrome closes.');
    if (token.expires > this.now() + 60000) return token;
    if (!token.refresh) { this.#tokens.delete(id); throw fail('Your ChatGPT session expired. Sign in again.'); }
    if (!this.#refreshes.has(id)) {
      const refreshing = (async () => {
        try {
          const data = await this.json(`${AUTH_ORIGIN}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: id, refresh_token: token.refresh, resource: RESOURCE }) });
          if (data.id_token) {
            const identity = await this.verify(data.id_token, id);
            if (identity.subject !== this.accounts.get(id)?.subject) throw fail('OpenAI returned a different account during renewal. Sign in again.');
          }
          if (this.#tokens.get(id) !== token) throw fail('The ChatGPT connection changed. Retry when ready.');
          const next = this.tokenSet(data, token); this.#tokens.set(id, next); return next;
        } catch (e) { if (TERMINAL_REFRESH.has(e.code) && this.#tokens.get(id) === token) this.#tokens.delete(id); throw e; }
        finally { this.#refreshes.delete(id); }
      })();
      this.#refreshes.set(id, refreshing);
    }
    return this.#refreshes.get(id);
  }
  async models(id = this.active) {
    const token = await this.access(id);
    if (!token.scopes.includes(PLAN_SCOPE)) throw fail('Allow ChatGPT plan usage in Translator settings first.');
    const data = await this.json(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token.access}` } });
    if (this.#tokens.get(id) !== token) throw fail('The ChatGPT connection changed.');
    if (!Array.isArray(data.models)) throw fail('OpenAI did not return the ChatGPT model list.');
    token.models = data.models.filter(m => m.visibility === 'list' && typeof m.slug === 'string').map(m => ({ slug: m.slug, name: String(m.display_name || m.slug) }));
    return token.models;
  }
  use({ accountId = this.active, model }) {
    const account = this.accounts.get(accountId), token = this.#tokens.get(accountId);
    if (!account || !token?.scopes.includes(PLAN_SCOPE)) throw fail('Sign in and allow ChatGPT plan usage first.');
    const chosen = model || account.model;
    if (!token.models.some(m => m.slug === chosen)) throw fail('Choose an available model for this ChatGPT account.');
    account.model = chosen; this.active = accountId; return this.status();
  }
  welcome() { const account = this.accounts.get(this.active); if (account) account.welcomed = true; }
  async signOut(id = this.active) {
    this.cancel();
    const token = this.#tokens.get(id); this.#tokens.delete(id);
    let revoked = !token?.refresh;
    if (token?.refresh) {
      try {
        if (!this.#discovery) this.#discovery = await this.json(`${AUTH_ORIGIN}/.well-known/openid-configuration`);
        const url = new URL(this.#discovery.revocation_endpoint);
        if (url.origin !== AUTH_ORIGIN || url.username || url.password) throw new Error('Invalid revocation endpoint');
        for (let n = 0; n < 2; n++) {
          try { await this.json(url.href, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: token.refresh, token_type_hint: 'refresh_token', client_id: id }), signal: AbortSignal.timeout(8000) }); revoked = true; break; }
          catch { if (n === 0) await new Promise(resolve => setTimeout(resolve, 500)); }
        }
      } catch {}
    }
    return { revoked, message: revoked ? 'Signed out of Smart Subtitles.' : 'Signed out locally. Remote revocation could not be confirmed; disconnect Smart Subtitles in ChatGPT usage settings.' };
  }
  async translate({ request, target }, signal) {
    const id = this.active, account = this.accounts.get(id), token = await this.access(id);
    signal?.throwIfAborted();
    if (!token.scopes.includes(PLAN_SCOPE)) throw fail('Allow ChatGPT plan usage in Translator settings first.');
    if (!token.models.some(m => m.slug === account.model)) throw fail('The default model is not available to this account. Choose a model in Translator settings.');
    let response;
    try {
      response = await this.fetcher(`${RESOURCE}/responses`, { ...PRIVATE_REQUEST, method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.access}` }, body: JSON.stringify({ model: account.model, instructions: subtitleInstructions, input: [{ role: 'user', content: subtitlePrompt(request, target) }], store: false, stream: true, ...(account.model.startsWith('gpt-6') ? { reasoning: { effort: 'low' } } : {}) }) });
    } catch (e) { if (signal?.aborted) throw e; throw fail('Could not reach OpenAI. Retry when your connection is ready.'); }
    if (!response.ok) { let data; try { data = await readJSON(response); } catch {} throw apiError(response.status, data, 'ChatGPT translation failed'); }
    return readResponsesStream(response, request.cues, signal);
  }
}

export async function readResponsesStream(response, cues, signal) {
  if (!response.body) throw fail('OpenAI returned no response stream.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', text = '', total = 0, usage, completed = false;
  const event = block => {
    const payload = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!payload || payload === '[DONE]') return;
    let data; try { data = JSON.parse(payload); } catch { throw fail('OpenAI returned an unreadable response stream.'); }
    if (['response.failed', 'error'].includes(data.type)) throw apiError(200, data.response || data, 'ChatGPT translation failed');
    if (data.type === 'response.incomplete') throw fail('ChatGPT did not finish this subtitle batch. Retry or choose another model.');
    if (data.type === 'response.output_text.delta') text += data.delta || '';
    if (data.type === 'response.completed') {
      const full = data.response?.output?.flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('');
      if (full) text = full;
      usage = data.response?.usage || {}; completed = true;
    }
  };
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength; if (total > 2_000_000) throw fail('OpenAI returned too much data for this subtitle batch.');
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) { const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); event(block); }
    }
    buffer += decoder.decode(); if (buffer.trim()) event(buffer);
    if (!completed) throw fail('The ChatGPT response was interrupted. Retry this subtitle batch.');
    return { segments: parseModelSegments(text, cues), usage };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
