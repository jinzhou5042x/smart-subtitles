# Smart Subtitles

[English](#english) | [中文](#中文) | [Español](#español)

## English

Bilingual subtitles for Hulu and Disney+, including Hulu content on Disney+. English subtitles appear alongside your chosen translation.

[Chrome Web Store](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) · [Issues](https://github.com/jinzhou5042x/smart-subtitles/issues) · [Terms & Privacy](https://jinzhou5042x.github.io/smart-subtitles/)

### Start watching

1. Install the extension in desktop Chrome.
2. Open a video with English subtitles. Choose your language in the extension.
3. Leave **Browser translation** selected. If a **Start subtitles** button appears on the video, click it and wait for Chrome to prepare the language pack.

No ZIP, Node.js, API key or companion app is needed for browser translation. Language packs need an initial download and use local disk space. Availability depends on your browser, language and organization settings. If unavailable, choose a cloud translator.

Move the subtitles by dragging them. Adjust **Size** in the popup. Translation starts near the playhead and prepares a short section ahead; jumping ahead prioritizes the new position. Completed lines are saved in this browser, up to 30,000 lines. Reloading reuses saved translations. A failed request pauses with **Retry** instead of repeatedly spending quota.

Chrome's [built-in Translator API](https://developer.chrome.com/docs/ai/translator-api) is a local translation model, separate from Google Cloud Translation. Translation quality varies; cloud LLMs can use nearby dialogue to handle context and slang. LLMs may take longer, and short windows can lose some long-range context. Netflix, YouTube, mobile browsers and live TV are not supported.

### Choose a translator

Open **Translator settings** from the popup. Switching to a paid provider is always your choice; the extension does not silently fall back to one.

| Translator | Setup |
| --- | --- |
| Browser translation | No account; Chrome prepares the language pack |
| Google Cloud | Your Cloud Translation Basic v2 API key |
| OpenAI API | Your API key and model; API billing is separate from ChatGPT |
| DeepSeek | Your API key and model |
| Claude API | Your API key and model |
| Qwen | Your API key, model and workspace base URL for your region |
| Other / local model | An OpenAI-compatible Chat Completions base URL and model; key optional for your local server |
| Codex subscription | Optional companion, described below |

Click **Save and use**, then optionally **Test with “Hello.”** The test sends one small request and may use paid quota. Keys stay in the extension's local storage, are not synced, and are not sent to the video website. Clear a key with **Remove key**. Changing API servers requires entering the key again.

Google Cloud is fast and handled common idioms well in our small test. It does not receive the nearby context sent to LLMs. LLM requests include the video title and nearby dialogue; only the requested subtitle window is translated. Custom HTTPS servers and HTTP servers on localhost are supported. The extension asks for access to the server you select. Your own model server must already be running.

### Translation comparison

We tested the same 36 English cues in Simplified Chinese, three times, without cache. Median time per window of 6–10 cues: **browser 0.098 s**, **Google 0.156 s**, **Codex 3.765 s**. Browser translation made several literal idiom errors. Google handled the selected idioms well. Codex sounded more natural but moved or repeated content between cues. Passing earlier translations as context kept the tested names consistent in the final runs. These are provider timings from one Windows machine, not general accuracy scores or full-player latency.

[Full comparison, exact outputs and limitations](https://jinzhou5042x.github.io/smart-subtitles/docs/translation-review.html).

### Get a Google API key

Follow Google's [Cloud Translation setup guide](https://docs.cloud.google.com/translate/docs/setup) and [API key documentation](https://docs.cloud.google.com/docs/authentication/api-keys):

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable billing for that project and enable **Cloud Translation API**.
3. In **APIs & Services → Credentials**, choose **Create credentials → API key**.
4. Restrict the key to **Cloud Translation API** and review the project's quotas. Application restrictions must permit requests from the extension.
5. In **Translator settings → Google Cloud**, paste the key and click **Save and use**.

We use Basic v2, which [supports API keys](https://docs.cloud.google.com/translate/docs/authentication). No credential file or local program is needed. Check [Google's pricing](https://cloud.google.com/translate/pricing) before use.

### Optional: Codex subscription

This is the only bundled translator that needs our companion. It uses your Codex/ChatGPT login, with **gpt-6-luna**, reasoning effort **low**, by default. Access and usage limits depend on your account; see [OpenAI's plan information](https://learn.chatgpt.com/docs/pricing).

Download the companion for [Windows x64](https://github.com/jinzhou5042x/smart-subtitles/releases/latest/download/SmartSubtitles-Service-win-x64.zip), [Mac Apple Silicon](https://github.com/jinzhou5042x/smart-subtitles/releases/latest/download/SmartSubtitles-Service-darwin-arm64.zip) or [Mac Intel](https://github.com/jinzhou5042x/smart-subtitles/releases/latest/download/SmartSubtitles-Service-darwin-x64.zip). Extract it into a permanent folder and run **Set Up Codex** once. Then choose **Codex subscription → Connect Codex** in Translator settings. Chrome starts it when needed. If you move its folder, run **Start Subtitles** again. Mac may require allowing the launcher in **System Settings → Privacy & Security**.

Browser-only subscription login is not implemented. The official open-source [Sign in with ChatGPT flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) currently documents a local callback. The extension does not copy credentials out of another app or use private ChatGPT endpoints.

### Troubleshooting

If subtitles are missing, enable English captions in the video player and reload. If browser translation is unavailable, check that desktop Chrome is updated or choose a cloud provider. For a quota, key or model error, correct the setting and click **Retry translation**. Clear the browser cache from **Translator settings → Clear saved translations**.

For other problems, [open an issue](https://github.com/jinzhou5042x/smart-subtitles/issues) with **Copy diagnostics**, browser/OS versions and reproduction steps. Review diagnostics before posting; issues are public. Contributions for translators, player support and translations are welcome.

### For developers

Node.js 22.13+ is a build/test dependency, not a user requirement.

```sh
git clone https://github.com/jinzhou5042x/smart-subtitles.git
cd smart-subtitles
npm ci
npm run build
npm test
npx playwright install chromium
npm run check:extension
npm run package
```

Load `dist/extension` at `chrome://extensions` with developer mode enabled. `npm start` serves the local video fixture at `http://127.0.0.1:43128/demo`. The store ZIP is in `dist/store`. `npm run release -- win-x64` builds the optional Codex companion; build Mac targets on a Mac. `npm run start:companion` starts the optional service during development.

The extension owns translation windows and IndexedDB caching. `extension/translation.js` implements cloud adapters; `extension/builtin.js` uses the document-only browser Translator API. `extension/session.js` prioritizes the playhead. `extension/sites.js` registers players; run `npm run manifest` after changing it. Browser checks use a local model test double and a fresh browser profile; they do not prove provider account access or every streaming player works. `node scripts/check-native.mjs` separately checks the actual browser translator in installed desktop Chrome and may download a language pack.

## 中文

为 Hulu、Disney+（包括 Disney+ 内的 Hulu 内容）显示双语字幕。视频需要有英文字幕。

[Chrome 应用商店](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) · [反馈问题](https://github.com/jinzhou5042x/smart-subtitles/issues) · [条款与隐私](https://jinzhou5042x.github.io/smart-subtitles/)

### 开始使用

1. 在桌面版 Chrome 安装扩展。
2. 打开有英文字幕的视频，在扩展中选择目标语言。
3. 保持 **Browser translation**。如果视频上出现 **Start subtitles**，点击后等待 Chrome 准备语言包。

浏览器翻译不需要下载 ZIP、安装 Node、申请 API key 或运行配套程序。首次需要下载语言包并占用本地磁盘；是否可用取决于浏览器、语言和组织策略。不支持时，可以自行选择云端翻译器，不会自动切换到收费服务。

拖动字幕可以调整位置，**Size** 调整字号。优先翻译当前播放位置并预先准备后面一小段，跳转后优先处理新位置。缓存保存在浏览器中，最多 30,000 行，刷新后可以复用。请求失败会暂停，修复后点击 **Retry translation**，不会无限重试扣额度。

[Chrome 内置翻译](https://developer.chrome.com/docs/ai/translator-api)使用本地模型，与 Google Cloud 是不同服务，效果需要按实际影片判断。Google Cloud 很快，在这次小样本测试中也正确处理了常见俚语；它没有收到 LLM 那样的附近上下文。LLM 的表达通常更自然，但更慢，也可能出现跨行重复或译名不统一。目前不支持 Netflix、YouTube、手机浏览器和直播。

### 云端翻译和本地模型

打开 **Translator settings**。支持 Google Cloud、OpenAI API、DeepSeek、Claude API、Qwen，以及提供 OpenAI Chat Completions 兼容接口的其他服务或本地模型。

填写自己的 key 和模型名称，点击 **Save and use**。Qwen 还需要填对应区域的工作区 API base URL；本地模型填写 `http://localhost:端口/v1`，并先启动自己的模型服务。云端连接使用 HTTPS，选定服务后才请求对应权限。API 费用由服务商收取，与聊天产品订阅通常分开。

**Test with “Hello.”** 会发送一次简短测试请求，可能使用付费额度。key 只存在扩展的本地存储，不同步、不传给视频网页。**Remove key** 删除凭据；更换服务器需要重新填 key。

### 实测对比

同一组 36 条英文字幕翻成简体中文，重复 3 次、不用缓存。每窗口 6–10 条字幕的中位耗时：**内置 0.098 秒、Google 0.156 秒、Codex 3.765 秒**。内置有多处俚语直译；Google 在这组样本里表现稳定；Codex 更自然，但有跨行重复或调序；补上已译上下文后，本次人名保持一致。这是单台 Windows 机器的翻译引擎耗时，不是完整播放器延迟或通用准确率。

[完整译例、原始数据和限制](https://jinzhou5042x.github.io/smart-subtitles/docs/translation-review.html)。

### Google API key 怎么申请

参考 Google 的[官方设置教程](https://docs.cloud.google.com/translate/docs/setup)和[API key 文档](https://docs.cloud.google.com/docs/authentication/api-keys)：

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 新建或选择项目。
2. 为项目启用结算，启用 **Cloud Translation API**。
3. 进入 **APIs & Services → Credentials → Create credentials → API key**。
4. 将 key 的 API 权限限制为 **Cloud Translation API**，检查项目配额；应用限制需要允许扩展发出的请求。
5. 在 **Translator settings → Google Cloud** 粘贴 key，点击 **Save and use**。

使用的是[支持 API key 的 Basic v2](https://docs.cloud.google.com/translate/docs/authentication)，不需要密钥文件或本地程序。使用前查看[官方价格](https://cloud.google.com/translate/pricing)。

### 可选：Codex 订阅

只有这个选项需要我们的配套程序。默认使用 **gpt-6-luna / low**，消耗自己的 Codex/ChatGPT 额度；模型权限和额度取决于账号，参考[官方订阅信息](https://learn.chatgpt.com/docs/pricing)。

下载 [Windows x64](https://github.com/jinzhou5042x/smart-subtitles/releases/latest/download/SmartSubtitles-Service-win-x64.zip)、[Mac Apple Silicon](https://github.com/jinzhou5042x/smart-subtitles/releases/latest/download/SmartSubtitles-Service-darwin-arm64.zip) 或 [Mac Intel](https://github.com/jinzhou5042x/smart-subtitles/releases/latest/download/SmartSubtitles-Service-darwin-x64.zip) 的程序。解压到固定位置，运行一次 **Set Up Codex** 并登录，再在设置中选择 **Codex subscription → Connect Codex**。以后由 Chrome 按需启动。移动目录后重新运行 **Start Subtitles**。Mac 首次可能需要在“系统设置 → 隐私与安全性”放行。

本版本没有实现纯浏览器的订阅登录，官方[开源登录流程](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)目前要求本机回调。

### 遇到问题 / 开发

没有字幕时，先打开播放器的英文字幕并刷新。语言包不可用时，更新桌面版 Chrome 或选择云端服务。key、额度、模型错误修复后点击重试。在设置里清除翻译缓存不会删除 key。

[提交 issue](https://github.com/jinzhou5042x/smart-subtitles/issues)时附上 **Copy diagnostics**、系统与浏览器版本以及复现步骤；发布前检查内容，issue 是公开的。欢迎贡献翻译器、播放器适配和语言支持。

从源码构建见上方 [For developers](#for-developers)。Node 只用于构建和开发测试，普通用户不需要安装。

## Español

Subtítulos bilingües para Hulu y Disney+, incluido el contenido de Hulu en Disney+. El video debe tener subtítulos en inglés.

[Chrome Web Store](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) · [Reportar un problema](https://github.com/jinzhou5042x/smart-subtitles/issues) · [Términos y privacidad](https://jinzhou5042x.github.io/smart-subtitles/)

### Empezar

1. Instala la extensión en Chrome para escritorio.
2. Abre un video con subtítulos en inglés y elige tu idioma en la extensión.
3. Mantén **Browser translation**. Si aparece **Start subtitles** sobre el video, púlsalo y espera a que Chrome prepare el paquete de idioma.

La traducción del navegador no necesita ZIP, Node, clave API ni programa adicional. La primera descarga del idioma ocupa espacio local. La disponibilidad depende del navegador, el idioma y las políticas de tu organización. Si no está disponible, puedes elegir un proveedor en la nube; nunca se cambia automáticamente a uno de pago.

Arrastra los subtítulos para moverlos y ajusta **Size**. Se traduce primero la posición actual y un tramo por delante. Al saltar, se prioriza la nueva posición. Se guardan hasta 30.000 líneas en el navegador y se reutilizan al recargar. Un fallo pausa la traducción para evitar reintentos de pago continuos.

La [traducción integrada de Chrome](https://developer.chrome.com/docs/ai/translator-api) usa un modelo local distinto de Google Cloud. Google Cloud fue rápido y resolvió bien los modismos de nuestra pequeña prueba. Los LLM reciben diálogo cercano y suelen sonar más naturales, pero tardan más y pueden repetir contenido entre subtítulos o variar los nombres. No se admiten Netflix, YouTube, navegadores móviles ni emisiones en directo.

### Proveedores

En **Translator settings** puedes configurar Google Cloud, OpenAI API, DeepSeek, Claude API, Qwen o un servidor compatible con OpenAI Chat Completions. Introduce tu clave y modelo y pulsa **Save and use**. Qwen requiere la URL base del espacio de trabajo y región; para un modelo local, usa `http://localhost:PUERTO/v1` y arranca tu propio servidor. Las conexiones remotas requieren HTTPS.

Las claves se guardan únicamente en este perfil del navegador, sin sincronizarse ni enviarse al sitio del video. **Remove key** las elimina. Cambiar de servidor requiere introducir la clave de nuevo. **Test with “Hello.”** envía una petición pequeña que puede consumir cuota de pago. La facturación API es independiente de las suscripciones de chat.

### Comparación medida

Tradujimos las mismas 36 líneas del inglés al chino simplificado, tres veces y sin caché. Mediana por ventana de 6–10 líneas: **navegador 0,098 s**, **Google 0,156 s**, **Codex 3,765 s**. El navegador cometió errores literales con modismos; Google funcionó bien en esta muestra; Codex sonó más natural, pero repitió o desplazó contenido entre líneas. El contexto con traducciones anteriores mantuvo los nombres de la prueba consistentes en la versión final. Son tiempos del motor en un solo equipo Windows, no una puntuación general de precisión ni la latencia completa del reproductor.

[Resultados, traducciones originales y limitaciones](https://jinzhou5042x.github.io/smart-subtitles/docs/translation-review.html).

### Conseguir una clave de Google

Sigue la [guía oficial de configuración](https://docs.cloud.google.com/translate/docs/setup) y la [documentación de claves API](https://docs.cloud.google.com/docs/authentication/api-keys):

1. Crea o selecciona un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. Activa la facturación y **Cloud Translation API**.
3. Ve a **APIs & Services → Credentials → Create credentials → API key**.
4. Limita la clave a **Cloud Translation API** y revisa las cuotas. Las restricciones de aplicación deben permitir peticiones de la extensión.
5. Pega la clave en **Translator settings → Google Cloud** y pulsa **Save and use**.

Usamos [Basic v2, compatible con claves API](https://docs.cloud.google.com/translate/docs/authentication). No hace falta un archivo de credenciales ni un programa local. Consulta los [precios de Google](https://cloud.google.com/translate/pricing).

### Opcional: suscripción de Codex

Solo este modo necesita nuestro programa adicional. Usa tu cuenta de Codex/ChatGPT, con **gpt-6-luna / low** por defecto. El acceso y la cuota dependen de tu cuenta; consulta los [planes oficiales](https://learn.chatgpt.com/docs/pricing).

Descarga [Windows x64](https://github.com/jinzhou5042x/smart-subtitles/releases/latest/download/SmartSubtitles-Service-win-x64.zip), [Mac Apple Silicon](https://github.com/jinzhou5042x/smart-subtitles/releases/latest/download/SmartSubtitles-Service-darwin-arm64.zip) o [Mac Intel](https://github.com/jinzhou5042x/smart-subtitles/releases/latest/download/SmartSubtitles-Service-darwin-x64.zip). Extrae el ZIP a una carpeta permanente y ejecuta **Set Up Codex** una vez. Después elige **Codex subscription → Connect Codex** en la extensión. Chrome lo inicia cuando hace falta. Si mueves la carpeta, ejecuta **Start Subtitles** otra vez. macOS puede pedir autorización en **Ajustes del Sistema → Privacidad y seguridad**.

No se ha implementado el acceso a la suscripción solo desde el navegador; el [flujo oficial de código abierto](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) documenta una devolución de llamada local.

### Problemas y desarrollo

Si faltan subtítulos, activa los subtítulos en inglés del reproductor y recarga. Actualiza Chrome o elige un proveedor en la nube si la traducción local no está disponible. Corrige los errores de clave, cuota o modelo y pulsa **Retry translation**. **Clear saved translations** borra la caché, sin borrar tus claves.

Para [reportar un fallo](https://github.com/jinzhou5042x/smart-subtitles/issues), adjunta **Copy diagnostics**, las versiones del sistema y navegador y los pasos para reproducirlo. Revisa el contenido antes de publicarlo: los issues son públicos. Se agradecen contribuciones de proveedores, reproductores e idiomas.

Las instrucciones para compilar están en [For developers](#for-developers). Node se necesita para el desarrollo, no para el uso normal.
