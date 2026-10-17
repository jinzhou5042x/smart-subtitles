const query = new URLSearchParams(location.search);
history.replaceState(null, '', location.pathname);
try {
  const params = {};
  for (const [source, target] of Object.entries({ code: 'code', state: 'state', client_id: 'clientId', error: 'error' })) {
    if (query.getAll(source).length > 1) throw new Error('Invalid sign-in callback. Start sign-in again.');
    if (query.has(source)) params[target] = query.get(source);
  }
  const reply = await chrome.runtime.sendMessage({ type: 'chatgptCallback', params });
  if (!reply?.ok) throw new Error(reply?.error || 'Sign-in could not be completed.');
  location.replace(chrome.runtime.getURL('settings.html#chatgpt'));
} catch (error) { document.getElementById('result').textContent = error.message; }
