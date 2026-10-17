// The DNR API is declared at installation. Only its specific login hosts need consent here.
// Dynamically granting the API itself can hang updateSessionRules (Chromium issue 551296620).
export const CHATGPT_PERMISSIONS = { origins: ['https://auth.openai.com/*', 'https://api.openai.com/*', 'http://127.0.0.1/*'] };
