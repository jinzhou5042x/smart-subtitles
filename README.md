# Smart Subtitles

[English](#english) | [中文](#中文) | [Español](#español)

## English

Bilingual subtitles for Hulu and Disney+, including Hulu content on Disney+. English subtitles appear alongside your chosen translation.

[Chrome Web Store](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) · [Issues](https://github.com/jinzhou5042x/smart-subtitles/issues) · [Terms & Privacy](https://jinzhou5042x.github.io/smart-subtitles/)

### Start watching

1. [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) in desktop Chrome.
2. Open a video with English subtitles. Choose your language in the extension.
3. Leave **Browser translation** selected. If a **Start subtitles** button appears on the video, click it and wait for Chrome to prepare the language pack.

The extension runs on desktop Chrome on Windows, macOS and Linux. There is no companion app to download or run. Browser translation needs no account or key; Chrome prepares the language pack on the video page on first use, without a separate installer. Availability depends on your browser, language and organization settings. If unavailable, choose a cloud translator.

Move the subtitles by dragging them. Adjust **Size** in the popup. Translation starts at the beginning and works through the subtitles in order, one batch at a time, including while the video is paused. Seeking does not restart or reorder it. If you jump ahead, you may need to wait for translation to catch up, especially with an LLM. The popup shows how many lines are done. Completed lines are saved in this browser, up to 1,000,000 lines. Reloading reuses saved translations. A failed request pauses with **Retry** instead of repeatedly spending quota.

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
| ChatGPT subscription | **Continue with ChatGPT**; uses the plan allowance you authorize |

Open **Your own API key** in Translator settings, pick the service, paste your key and click **Connect**. Connect sends one short test line (which may use paid quota) and switches subtitles to that service once it answers. Keys stay in memory for this Chrome session and are not sent to the video website. Enter the key again after restarting Chrome or reloading the extension; the server address and model are remembered. **Disconnect** clears the key. Changing API servers requires entering the key again.

Google Cloud is fast and handled common idioms well in our small test. It does not receive the nearby context sent to LLMs. LLM requests include the video title and nearby dialogue; only the requested subtitle window is translated. Custom HTTPS servers and HTTP servers on localhost are supported. The extension asks for access to the server you select. Your own model server must already be running.

### Translation comparison

We tested the same 36 English cues in Simplified Chinese, three times, without cache. Median time per window of 6–10 cues: **browser 0.098 s**, **Google 0.156 s**, **Codex 3.765 s**. Browser translation made several literal idiom errors. Google handled the selected idioms well. Codex sounded more natural but moved or repeated content between cues. Passing earlier translations as context kept the tested names consistent in the final runs. These are provider timings from one Windows machine, not general accuracy scores or full-player latency.

The Codex result used the old CLI connection. It does **not** measure the new browser-based ChatGPT connection. [Full comparison, exact outputs and limitations](https://jinzhou5042x.github.io/smart-subtitles/docs/translation-review.html).

### Get a Google API key

Follow Google's [Cloud Translation setup guide](https://docs.cloud.google.com/translate/docs/setup) and [API key documentation](https://docs.cloud.google.com/docs/authentication/api-keys):

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable billing for that project and enable **Cloud Translation API**.
3. In **APIs & Services → Credentials**, choose **Create credentials → API key**.
4. Restrict the key to **Cloud Translation API** and review the project's quotas. Application restrictions must permit requests from the extension.
5. In **Translator settings → Your own API key**, choose **Google Cloud**, paste the key and click **Connect**.

We use Basic v2, which [supports API keys](https://docs.cloud.google.com/translate/docs/authentication). No credential file or local program is needed. Check [Google's pricing](https://cloud.google.com/translate/pricing) before use.

### Use your ChatGPT subscription

1. Open **Translator settings** and click **ChatGPT**.
2. Click **Continue with ChatGPT** and allow the connection when Chrome asks.
3. Sign in on OpenAI's page and authorize Smart Subtitles to use your ChatGPT plan. You return to settings automatically, and subtitles switch to ChatGPT.
4. The default model is **gpt-6-luna / low**. To change it, pick another in **Model**; it is saved right away.

While sign-in is open, **Return to sign-in** takes you back to that tab. **Cancel** closes the attempt. If the tab closes or sign-in times out, the settings page explains what happened and lets you try again.

There is no API key or local program to set up. Account eligibility, available models and limits come from OpenAI. [Manage usage](https://chatgpt.com/settings/usage) shows the allowance you share with this extension. If you run out, translation pauses; it does not switch to a separately billed API. See [how ChatGPT plan sharing works](https://developers.openai.com/siwc/token-sharing-open-source).

Sign-in credentials stay in memory while Chrome runs. After fully quitting Chrome or reloading the extension, sign in again using the saved account entry. Closing a settings tab does not sign you out. **Sign out** disconnects this extension and asks OpenAI to revoke its token; other apps' logins are separate. Account labels are saved locally so you can reconnect later.

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
npm run check:chatgpt
npm run package
```

Load `dist/extension` at `chrome://extensions` with developer mode enabled. `npm start` serves the local video fixture at `http://127.0.0.1:43128/demo`. The store ZIP is in `dist/store`; the same package works across desktop operating systems. Dependencies are bundled locally during the build; the extension does not download executable code.

The extension owns translation windows and IndexedDB caching. `extension/translation.js` implements cloud adapters; `extension/builtin.js` uses the document-only browser Translator API. `extension/session.js` processes the track in order, independently of playback position. `extension/sites.js` registers players; run `npm run manifest` after changing it.

ChatGPT credentials live in a dedicated worker hosted by an offscreen document. The extension uses the [official OAuth/PKCE flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) and public Responses API. A temporary, tab-specific Chrome redirect rule captures the exact loopback callback; no local listener is started. The loopback flow is documented by OpenAI; this browser interception is our adaptation. Tokens are never written to Chrome storage. `jose` verifies ID-token signatures and claims.

The store build injects scripts only on supported video sites. Provider hosts need separate permission when selected; the optional HTTPS wildcard allows custom API addresses, and is never requested as a wildcard. API calls omit cookies and referrers, refuse redirects, and do not use the browser's HTTP cache. API keys use Chrome's memory-only `storage.session`, restricted to trusted extension contexts. Existing keys are moved out of `storage.local` when this version starts. ChatGPT tokens stay in the dedicated worker's memory.

The release checks enforce a file inventory, permissions and content security policy, and reject remote executable code, native helpers and test transports. CI runs dependency auditing and uses pinned GitHub Actions with limited permissions. These checks reduce specific risks; they do not constitute a security certification or guarantee sign-in eligibility. Public installation should go through the Chrome Web Store. A GitHub ZIP is a developer build, and publishing a GitHub release does not submit it for store review.

Browser checks use synthetic API responses and a fresh browser profile. They check callback validation, renewal, streaming, service-worker suspension, sign-out and the absence of stored tokens, but cannot prove real account access or streaming-site compatibility. `npm run check:chatgpt:live` builds the production extension and opens your regular Chrome's extensions page. Load or reload `dist/extension`, sign in from Translator settings, then click **Test** to check a real translation using your allowance. Use regular Chrome for this check: [Google may reject sign-in in an automated browser](https://support.google.com/accounts/answer/7675428). `node scripts/check-native.mjs` separately checks Chrome's real local translator and may download a language pack.

## 中文

为 Hulu、Disney+（包括 Disney+ 内的 Hulu 内容）显示双语字幕。视频需要有英文字幕。

[Chrome 应用商店](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) · [反馈问题](https://github.com/jinzhou5042x/smart-subtitles/issues) · [条款与隐私](https://jinzhou5042x.github.io/smart-subtitles/)

### 开始使用

1. 用桌面版 Chrome [从应用商店安装扩展](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno)。
2. 打开有英文字幕的视频，在扩展中选择目标语言。
3. 保持 **Browser translation**。如果视频上出现 **Start subtitles**，点击后等待 Chrome 准备语言包。

Windows、macOS、Linux 都只需要桌面版 Chrome 扩展，不用另下 ZIP 或运行配套程序。浏览器翻译不需要账号或 key；首次由 Chrome 在视频页面内准备语言包，会占用本地磁盘，不用去别处下载或安装。是否可用取决于浏览器、语言和组织策略。不支持时，可以自行选择云端翻译器，不会自动切换到收费服务。

拖动字幕可以调整位置，**Size** 调整字号。翻译从第一条字幕开始，一批接一批按顺序处理，暂停视频时也会继续。拖动进度条不会让翻译重头来过，也不会改变翻译顺序。快进到尚未翻译的位置，需要等翻译追上，LLM 的等待可能比较久；弹窗会显示已经完成的条数。缓存保存在浏览器中，最多 1,000,000 行，刷新后可以复用。请求失败会暂停，修复后点击 **Retry translation**，不会无限重试扣额度。

[Chrome 内置翻译](https://developer.chrome.com/docs/ai/translator-api)使用本地模型，与 Google Cloud 是不同服务，效果需要按实际影片判断。Google Cloud 很快，在这次小样本测试中也正确处理了常见俚语；它没有收到 LLM 那样的附近上下文。LLM 的表达通常更自然，但更慢，也可能出现跨行重复或译名不统一。目前不支持 Netflix、YouTube、手机浏览器和直播。

### 云端翻译和本地模型

打开 **Translator settings → Your own API key**，在 **Service** 里选要用的服务。支持 Google Cloud、OpenAI API、DeepSeek、Claude API、Qwen，以及提供 OpenAI Chat Completions 兼容接口的其他服务或本地模型。

填写自己的 key 和模型名称，点击 **Connect**。Qwen 还需要填对应区域的工作区 API base URL；本地模型填写 `http://localhost:端口/v1`，并先启动自己的模型服务。云端连接使用 HTTPS，选定服务后才请求对应权限。API 费用由服务商收取，与聊天产品订阅通常分开。

**Connect** 会发送一句简短的测试请求（可能使用付费额度），测试通过后字幕就改用这个服务。key 只留在 Chrome 当前会话的内存中，不传给视频网页。重启 Chrome 或重新加载扩展后需要重新填 key，服务器地址和模型会保留。**Disconnect** 删除凭据；更换服务器也需要重新填 key。

### 实测对比

同一组 36 条英文字幕翻成简体中文，重复 3 次、不用缓存。每窗口 6–10 条字幕的中位耗时：**内置 0.098 秒、Google 0.156 秒、Codex 3.765 秒**。内置有多处俚语直译；Google 在这组样本里表现稳定；Codex 更自然，但有跨行重复或调序；补上已译上下文后，本次人名保持一致。这是单台 Windows 机器的翻译引擎耗时，不是完整播放器延迟或通用准确率。

Codex 的计时来自旧版 CLI 连接，**不代表新版浏览器内 ChatGPT 连接的速度**。[完整译例、原始数据和限制](https://jinzhou5042x.github.io/smart-subtitles/docs/translation-review.html)。

### Google API key 怎么申请

参考 Google 的[官方设置教程](https://docs.cloud.google.com/translate/docs/setup)和[API key 文档](https://docs.cloud.google.com/docs/authentication/api-keys)：

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 新建或选择项目。
2. 为项目启用结算，启用 **Cloud Translation API**。
3. 进入 **APIs & Services → Credentials → Create credentials → API key**。
4. 将 key 的 API 权限限制为 **Cloud Translation API**，检查项目配额；应用限制需要允许扩展发出的请求。
5. 在 **Translator settings → Your own API key** 选 **Google Cloud**，粘贴 key，点击 **Connect**。

使用的是[支持 API key 的 Basic v2](https://docs.cloud.google.com/translate/docs/authentication)，不需要密钥文件或本地程序。使用前查看[官方价格](https://cloud.google.com/translate/pricing)。

### 使用 ChatGPT 订阅

1. 打开 **Translator settings**，点击 **ChatGPT**。
2. 点击 **Continue with ChatGPT**，允许 Chrome 提示的连接权限。
3. 在 OpenAI 页面登录，授权 Smart Subtitles 使用自己的 ChatGPT 额度。完成后会自动回到设置页，字幕随即改用 ChatGPT。
4. 默认使用 **gpt-6-luna / low**。要换模型，在 **Model** 里直接选，立即生效。

登录途中切回了设置页，可以点 **Return to sign-in** 回到登录标签页，或点 **Cancel** 取消。关掉登录页或等待超时后，设置页会显示原因，可以重新登录。

不需要 API key，也不需要安装本地程序。账号是否支持、模型和额度以 OpenAI 实际返回为准。[Manage usage](https://chatgpt.com/settings/usage) 可以查看分配给扩展的额度。额度用完会暂停，不会偷偷改用单独收费的 API。参见[官方订阅共享说明](https://developers.openai.com/siwc/token-sharing-open-source)。

登录凭据只留在内存里。彻底退出 Chrome 或重新加载扩展后，需要选择保存的账号重新登录；关掉设置标签页不影响使用。**Sign out** 会退出当前扩展并请求 OpenAI 撤销令牌，其他应用的登录独立。扩展会保存账号名称等信息，方便下次连接。

### 遇到问题 / 开发

没有字幕时，先打开播放器的英文字幕并刷新。语言包不可用时，更新桌面版 Chrome 或选择云端服务。key、额度、模型错误修复后点击重试。在设置里清除翻译缓存不会删除 key。

[提交 issue](https://github.com/jinzhou5042x/smart-subtitles/issues)时附上 **Copy diagnostics**、系统与浏览器版本以及复现步骤；发布前检查内容，issue 是公开的。欢迎贡献翻译器、播放器适配和语言支持。

从源码构建见上方 [For developers](#for-developers)。Node 只用于构建和开发测试，普通用户不需要安装。

## Español

Subtítulos bilingües para Hulu y Disney+, incluido el contenido de Hulu en Disney+. El video debe tener subtítulos en inglés.

[Chrome Web Store](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) · [Reportar un problema](https://github.com/jinzhou5042x/smart-subtitles/issues) · [Términos y privacidad](https://jinzhou5042x.github.io/smart-subtitles/)

### Empezar

1. [Instala la extensión desde Chrome Web Store](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) en Chrome para escritorio.
2. Abre un video con subtítulos en inglés y elige tu idioma en la extensión.
3. Mantén **Browser translation**. Si aparece **Start subtitles** sobre el video, púlsalo y espera a que Chrome prepare el paquete de idioma.

En Windows, macOS y Linux solo necesitas la extensión de Chrome para escritorio. No hay un programa adicional que descargar o ejecutar. La traducción del navegador no necesita cuenta ni clave; Chrome prepara el paquete de idioma en la página del video la primera vez. Ocupa espacio local, pero no requiere un instalador aparte. La disponibilidad depende del navegador, el idioma y las políticas de tu organización. Si no está disponible, puedes elegir un proveedor en la nube; nunca se cambia automáticamente a uno de pago.

Arrastra los subtítulos para moverlos y ajusta **Size**. La traducción empieza desde el principio y avanza en orden, un lote cada vez, incluso con el video en pausa. Adelantar o retroceder no la reinicia ni cambia el orden. Si saltas a una parte aún sin traducir, tendrás que esperar a que la traducción llegue hasta allí, sobre todo con un LLM. La ventana de la extensión muestra cuántas líneas están listas. Se guardan hasta 1.000.000 líneas en el navegador y se reutilizan al recargar. Un fallo pausa la traducción para evitar reintentos de pago continuos.

La [traducción integrada de Chrome](https://developer.chrome.com/docs/ai/translator-api) usa un modelo local distinto de Google Cloud. Google Cloud fue rápido y resolvió bien los modismos de nuestra pequeña prueba. Los LLM reciben diálogo cercano y suelen sonar más naturales, pero tardan más y pueden repetir contenido entre subtítulos o variar los nombres. No se admiten Netflix, YouTube, navegadores móviles ni emisiones en directo.

### Proveedores

En **Translator settings** puedes configurar Google Cloud, OpenAI API, DeepSeek, Claude API, Qwen o un servidor compatible con OpenAI Chat Completions. Abre **Your own API key**, elige el servicio, introduce tu clave y modelo y pulsa **Connect**. Qwen requiere la URL base del espacio de trabajo y región; para un modelo local, usa `http://localhost:PUERTO/v1` y arranca tu propio servidor. Las conexiones remotas requieren HTTPS.

Las claves permanecen en memoria durante esta sesión de Chrome y no se envían al sitio del video. Tras reiniciar Chrome o recargar la extensión, introduce la clave de nuevo; la dirección del servidor y el modelo se conservan. **Disconnect** elimina la clave. Cambiar de servidor también requiere introducirla de nuevo. **Connect** envía una petición de prueba pequeña que puede consumir cuota de pago y, si responde, los subtítulos pasan a usar ese servicio. La facturación API es independiente de las suscripciones de chat.

### Comparación medida

Tradujimos las mismas 36 líneas del inglés al chino simplificado, tres veces y sin caché. Mediana por ventana de 6–10 líneas: **navegador 0,098 s**, **Google 0,156 s**, **Codex 3,765 s**. El navegador cometió errores literales con modismos; Google funcionó bien en esta muestra; Codex sonó más natural, pero repitió o desplazó contenido entre líneas. El contexto con traducciones anteriores mantuvo los nombres de la prueba consistentes en la versión final. Son tiempos del motor en un solo equipo Windows, no una puntuación general de precisión ni la latencia completa del reproductor.

El resultado de Codex corresponde a la antigua conexión CLI: **no mide la nueva conexión de ChatGPT desde el navegador**. [Resultados, traducciones originales y limitaciones](https://jinzhou5042x.github.io/smart-subtitles/docs/translation-review.html).

### Conseguir una clave de Google

Sigue la [guía oficial de configuración](https://docs.cloud.google.com/translate/docs/setup) y la [documentación de claves API](https://docs.cloud.google.com/docs/authentication/api-keys):

1. Crea o selecciona un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. Activa la facturación y **Cloud Translation API**.
3. Ve a **APIs & Services → Credentials → Create credentials → API key**.
4. Limita la clave a **Cloud Translation API** y revisa las cuotas. Las restricciones de aplicación deben permitir peticiones de la extensión.
5. En **Translator settings → Your own API key**, elige **Google Cloud**, pega la clave y pulsa **Connect**.

Usamos [Basic v2, compatible con claves API](https://docs.cloud.google.com/translate/docs/authentication). No hace falta un archivo de credenciales ni un programa local. Consulta los [precios de Google](https://cloud.google.com/translate/pricing).

### Usar tu suscripción de ChatGPT

1. Abre **Translator settings** y pulsa **ChatGPT**.
2. Pulsa **Continue with ChatGPT** y concede el permiso de conexión que pide Chrome.
3. Inicia sesión en la página de OpenAI y autoriza a Smart Subtitles a usar tu plan. Volverás a la configuración automáticamente y los subtítulos pasarán a usar ChatGPT.
4. El modelo predeterminado es **gpt-6-luna / low**. Para cambiarlo, elige otro en **Model**; se guarda al instante.

Mientras inicias sesión, **Return to sign-in** te lleva de vuelta a esa pestaña y **Cancel** cancela el intento. Si cierras la pestaña o se agota el tiempo, verás el motivo y podrás volver a intentarlo.

No necesitas clave API ni programa local. OpenAI determina qué cuentas, modelos y límites están disponibles. Consulta la cuota compartida con la extensión en [Manage usage](https://chatgpt.com/settings/usage). Al agotarse, la traducción se pausa; no cambia a una API de pago. Más información en la [documentación oficial](https://developers.openai.com/siwc/token-sharing-open-source).

Las credenciales permanecen en memoria mientras Chrome está abierto. Tras cerrar Chrome por completo o recargar la extensión, vuelve a iniciar sesión con la cuenta guardada. Cerrar la pestaña de ajustes no cierra la sesión. **Sign out** cierra la sesión de esta extensión y solicita a OpenAI que revoque su token; las sesiones de otras aplicaciones son independientes. Se guardan las etiquetas de las cuentas para facilitar el próximo acceso.

### Problemas y desarrollo

Si faltan subtítulos, activa los subtítulos en inglés del reproductor y recarga. Actualiza Chrome o elige un proveedor en la nube si la traducción local no está disponible. Corrige los errores de clave, cuota o modelo y pulsa **Retry translation**. **Clear saved translations** borra la caché, sin borrar tus claves.

Para [reportar un fallo](https://github.com/jinzhou5042x/smart-subtitles/issues), adjunta **Copy diagnostics**, las versiones del sistema y navegador y los pasos para reproducirlo. Revisa el contenido antes de publicarlo: los issues son públicos. Se agradecen contribuciones de proveedores, reproductores e idiomas.

Las instrucciones para compilar están en [For developers](#for-developers). Node se necesita para el desarrollo, no para el uso normal.
