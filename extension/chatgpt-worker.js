import { ChatGPTClient } from './chatgpt-auth.js';
let client;
const controllers = new Map();
self.onmessage = async ({ data: { id, command, args } }) => {
  if (command === 'cancelOperation') { controllers.get(args.id)?.controller.abort(); return; }
  const controller = new AbortController(); controllers.set(id, { command, controller });
  const cancelTranslations = () => { for (const item of controllers.values()) if (item.command === 'translate') item.controller.abort(); };
  try {
    if (command === 'initialize') { client ||= new ChatGPTClient({ metadata: args.metadata }); }
    if (!client) throw new Error('ChatGPT connection is not initialized.');
    let data;
    switch (command) {
      case 'initialize': case 'status': data = client.status(); break;
      case 'checkConnection': data = await client.checkConnection(); break;
      case 'begin': data = await client.begin(args); break;
      case 'finish': data = await client.finish(args); cancelTranslations(); break;
      case 'cancel': data = client.cancel(args?.tabId); break;
      case 'models': data = await client.models(args?.accountId); break;
      case 'use': data = client.use(args); cancelTranslations(); break;
      case 'welcome': client.welcome(); break;
      case 'signOut': cancelTranslations(); data = await client.signOut(args?.accountId); break;
      case 'translate': data = await client.translate(args, AbortSignal.any([controller.signal, AbortSignal.timeout(90000)])); break;
      default: throw new Error('Unknown ChatGPT operation.');
    }
    self.postMessage({ id, ok: true, data, metadata: client.metadata() });
  } catch (error) {
    self.postMessage({ id, ok: false, error: { message: error.name === 'TimeoutError' ? 'ChatGPT took too long. Retry this subtitle batch.' : error.message, code: error.code || '', status: error.status || 0, needsUser: !!error.needsUser }, metadata: client?.metadata() });
  } finally { controllers.delete(id); }
};
