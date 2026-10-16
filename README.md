# Smart Subtitles

[English](#english) | [中文](#中文)

## English

Watch **Hulu and Disney+** with English subtitles and a translation in your language, together on screen. Includes Hulu titles inside Disney+. Choose from 55 languages, adjust subtitle size and position, and reuse translations saved on your computer.

[**Install the Chrome extension**](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) · [**Download the translation program**](https://github.com/jinzhou5042x/smart-subtitles/releases) · [Report an issue](https://github.com/jinzhou5042x/smart-subtitles/issues)

### Get started

You need Chrome 127+, Windows x64 or macOS 13+ (Apple Silicon or Intel), and access to a supported video with **English subtitles**. Live TV, Netflix and YouTube are not supported yet.

1. **Install Smart Subtitles** from the Chrome Web Store using the link above. Pin it in Chrome's Extensions menu.
2. **Download the translation program** for your computer from Releases: Windows x64, Mac Apple Silicon (`darwin-arm64`) or Mac Intel (`darwin-x64`). Extract the entire ZIP into a permanent, writable folder and keep it there.
3. **Set up your translator.** For Codex, double-click **Set Up Codex.cmd** (Windows) or **Set Up Codex.command** (Mac), complete ChatGPT sign-in in the browser, and wait for setup to finish. For a Google-enabled installation, run **Start Subtitles** once and follow the Google steps below.
4. **Play a Hulu or Disney+ video.** Click the extension icon, enable the top-right switch, and choose your **Language**. The extension starts the translation program automatically; click **Connect** if shown.
5. **Watch with bilingual subtitles.** Codex should show **Logged in** and the translation program **Running**. Subtitles appear as translation progresses; you do not need to wait for the whole episode.

The downloaded package includes its runtime; no programming tools are needed. If you move the folder, run **Start Subtitles.cmd** or **Start Subtitles.command** once from the new location. On Mac, review the downloaded launcher's source before allowing it through Finder's **Open** action or **System Settings → Privacy & Security**, if macOS blocks it.

### Choose a translator

**Codex — recommended.** Uses your ChatGPT sign-in and episode context. The default is **GPT-6 Luna (`gpt-6-luna`) with low reasoning effort**, chosen to reduce reasoning-token overhead while keeping everyday subtitle translation practical. It still uses your account's allowance; available capacity depends on your plan and other usage.

Use a ChatGPT plan with access to GPT-6 Luna in Codex. OpenAI currently lists Plus at **US$20/month**; pricing and access can change, so check the [official plan details](https://learn.chatgpt.com/docs/pricing). Smart Subtitles does not charge a subscription fee.

**Google Cloud Translation — optional.** Uses your own API key and bills your Google Cloud account. It translates each subtitle individually. Default release configuration enables only Codex; Google controls appear when Google is enabled. Configuration details are in [For developers](#for-developers).

#### Get a Google Translation API key

Follow Google's [Cloud Translation setup guide](https://docs.cloud.google.com/translate/docs/setup) and [API key creation guide](https://docs.cloud.google.com/docs/authentication/api-keys#create).

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable billing for that project, then enable **Cloud Translation API** under **APIs & Services → Library**.
3. Open **APIs & Services → Credentials → Create credentials → API key**. Restrict the key to **Cloud Translation API** and save it.
4. Save the key alone in a UTF-8 text file in a private, permanent location on your computer.
5. In Smart Subtitles, choose **Google → API key → Choose file…** and select that file. The built-in **How to get one** link also provides guidance.

This integration uses **Cloud Translation Basic (v2)**, which supports API keys; Advanced (v3) does not. See [Google's authentication guide](https://docs.cloud.google.com/translate/docs/authentication). No SDK or service-account JSON file is needed for this workflow. Google requires billing; review its pricing and set appropriate usage quotas.

Click the selected filename to change files. **Unlink** removes the association without deleting the file. The program stores the file path, not a copy of the file; the key authenticates requests to Google. Moving the file requires selecting it again. Keep your key private.

### Controls and everyday use

<img src="docs/store/assets/promo-original.png" alt="Smart Subtitles language, translator, login, program status and subtitle size controls" width="354">

The screenshot shows both translators enabled. Your translator selector may be hidden when only Codex is enabled.

| Control | What it does |
| --- | --- |
| Top-right switch | Shows or hides bilingual subtitles, without changing the player's own captions. |
| Language | Selects the translation language. Each language and translator has its own saved translation. |
| Log in / Log out | Signs Codex in or out. Confirming logout stops translations and can affect other apps sharing that Codex login. |
| Translation program: Stop | Stops the local program; **Connect** starts it again. |
| Size | Adjusts text size. Drag subtitles up or down on the video to move them; the position is remembered. |
| Retry | Retries after you resolve a reported problem. |
| Translate again | Retranslates a completed title after confirmation, consuming translator allowance again. |
| Copy diagnostics | Copies troubleshooting information for an issue report. |

Saved translations load when you return. Closing a video stops its translation; reopening resumes from saved progress. Ads hide the overlay until the title returns. If Disney+ requests a sync interaction, move your pointer over the video or pause once. Adjust the player's own captions separately if two sets overlap. Refresh video tabs after an extension update.

**Translate again** clears the displayed subtitles and shows new ones as they are translated. If it stops, the previous translation returns. The saved version is replaced only when the new translation finishes.

### Troubleshooting

| Problem | What to do |
| --- | --- |
| Cannot connect / program not found | Run **Start Subtitles** in the extracted program folder, then **Connect**. Run **Check Environment** there if it still fails. |
| Codex not installed | Run **Set Up Codex**, wait for installation to finish, then retry. |
| Not logged in | Click **Log in** and complete browser sign-in. |
| Quota or account error | Resolve the account issue or wait for allowance to become available, then retry. |
| No subtitles | Check the switch, supported site, English subtitle availability and any error shown in the extension. |
| Extension cannot attach to the page | Refresh the video page; reload the extension too if requested by the error. |
| Google key file cannot be read | Select the file again and check it contains only the key. Use the setup guides above for API or account errors. |
| Disney+ timing is wrong | Follow the sync prompt; report persistent problems. |

For help, click **Copy diagnostics**, then **Report an issue**. Include your operating system, browser and extension versions, site, symptoms and reproduction steps. Review diagnostics and screenshots before posting; do not include API keys or sign-in information. macOS, ad-supported playback and long sessions have less live testing than the main Windows workflow.

### Privacy and local data

Smart Subtitles has no project-operated backend, account system, analytics or tracking. Subtitle text, translations, settings and logs are stored locally. Text for translation goes directly to your selected provider, whose terms and data policies apply. New translations require internet access and use your own provider account; cached translations are reused locally.

To clear saved translations and logs, stop the program and delete its `data` and `logs` folders. To stop using it, remove the Chrome extension and stop the program. Keep its folder if you want to preserve your data. Read [Terms & Privacy](https://jinzhou5042x.github.io/smart-subtitles/).

### Roadmap and contributions

We plan to add translators such as **DeepSeek, Claude, Qwen and models running on your own computer**, plus more streaming sites. These are planned integrations, not currently supported features. Contributions are welcome: translator adapters, site support, bug fixes, tests, documentation and translation-quality feedback. Open an issue to discuss a larger change, or send a pull request.

### For developers

Install **Git and Node.js 22.13+**. On macOS, also install Xcode Command Line Tools for the native file picker. Clone and build:

```sh
git clone https://github.com/jinzhou5042x/smart-subtitles.git
cd smart-subtitles
npm run build
```

1. Run **Set Up Codex.cmd** / **Set Up Codex.command** for Codex installation and sign-in.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/extension`.
3. Copy that extension's ID. Create or update `config/local.json`, preserving existing settings, with `"extensionIds": ["YOUR_UNPACKED_EXTENSION_ID"]`.
4. Run **Start Subtitles.cmd** / **Start Subtitles.command** to register the browser connection and start the program.
5. After changes, run `npm run build`, reload the extension, and refresh the video page.

To enable Google, merge `"providers": ["codex", "google"]` into `config/local.json`, then restart the translation program. This file is private and ignored by Git. Select the key file through the extension. Model and reasoning overrides also belong here (`model` and `effort`).

```sh
npm test
npm run check:browser
npm run package
npm run release
```

`package` writes the Chrome Web Store ZIP to `dist/store/`; `release` builds the translation-program archive for the host platform. Build macOS archives on macOS. Site adapters live in `extension/players/`, the site registry in `extension/sites.js`, translation code in `service/`, and tests in `tests/`. Keep keys, local configuration, logs and user data out of commits.

---

## 中文

在 **Hulu 和 Disney+** 视频上同时显示英文原字幕和中文等目标语言译文，也支持 Disney+ 内的 Hulu 内容。提供 55 种目标语言，可调整字号、拖动字幕，并复用本机保存的译文。

[**安装 Chrome 扩展**](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) · [**下载翻译程序**](https://github.com/jinzhou5042x/smart-subtitles/releases) · [反馈问题](https://github.com/jinzhou5042x/smart-subtitles/issues)

### 开始使用

需要 Chrome 127+、Windows x64 或 macOS 13 及以上（Apple Silicon / Intel），以及可以正常观看、带**英文字幕**的视频。暂不支持直播电视、Netflix 和 YouTube。

1. **安装扩展。** 点击上方 Chrome 应用商店链接安装 Smart Subtitles，并在 Chrome 扩展菜单中固定图标。
2. **下载翻译程序。** 在 Releases 选择 Windows x64、Mac Apple Silicon（`darwin-arm64`）或 Mac Intel（`darwin-x64`）安装包，将整个 ZIP 解压到长期保留、可写入的文件夹。
3. **配置翻译器。** 使用 Codex 时，Windows 双击 **Set Up Codex.cmd**，Mac 双击 **Set Up Codex.command**，在浏览器中完成 ChatGPT 登录并等待配置结束。使用已启用 Google 的配置时，运行一次 **Start Subtitles**，再按下面的 Google 步骤关联密钥。
4. **播放视频。** 打开 Hulu 或 Disney+ 视频，点击扩展图标，开启右上角开关，在 **Language** 中选择目标语言，例如 **Chinese (Simplified)**。程序自动启动；若显示 **Connect**，点击连接。
5. **开始观看。** 确认 Codex 显示 **Logged in**、翻译程序显示 **Running**。译文随翻译进度出现，无需等待整集完成。

安装包自带运行环境，不需要编程工具。移动程序文件夹后，在新位置运行一次 **Start Subtitles.cmd** 或 **Start Subtitles.command**。Mac 若拦截下载的启动文件，请确认来源后通过 Finder 的“打开”或“系统设置 → 隐私与安全性”放行。

### 选择翻译器

**Codex（推荐）：** 使用自己的 ChatGPT 登录和整集上下文。默认模型为 **GPT-6 Luna（`gpt-6-luna`），推理强度 low**，以减少推理 token 开销、满足日常字幕翻译需要为配置目标。翻译仍消耗账号额度，可用量取决于套餐和其他使用情况，并非无限使用。

需要包含 Codex 中 GPT-6 Luna 访问权限的 ChatGPT 套餐。官方目前列出的 Plus 价格为 **20 美元/月**；价格与权限可能调整，请查看[官方套餐说明](https://learn.chatgpt.com/docs/pricing)。Smart Subtitles 本身不收订阅费。

**Google Cloud Translation（可选）：** 使用自己的 API key，按 Google Cloud 账号计费，逐条翻译字幕。发行包默认仅启用 Codex，启用 Google 后才显示对应选项；配置方法见[开发者](#开发者)。

#### 申请 Google Translation API key

推荐阅读 Google 官方[Cloud Translation 配置教程](https://docs.cloud.google.com/translate/docs/setup?hl=zh-cn)及[创建 API key 教程](https://docs.cloud.google.com/docs/authentication/api-keys?hl=zh-cn#create)。简要步骤：

1. 登录 [Google Cloud Console](https://console.cloud.google.com/)，创建或选择一个项目。
2. 为项目启用结算，在 **API 和服务 → 库** 中启用 **Cloud Translation API**。
3. 进入 **API 和服务 → 凭据 → 创建凭据 → API 密钥**，将密钥的 API 限制设为 **Cloud Translation API** 并保存。
4. 将密钥单独存入 UTF-8 文本文件，放在本机私密、固定的位置。
5. 在扩展中选择 **Google → API key → Choose file…**，选择该文件。界面中的 **How to get one** 也提供配置指引。

本项目使用支持 API key 的 **Cloud Translation Basic（v2）**；Advanced（v3）不支持这种密钥方式，参见[官方认证说明](https://docs.cloud.google.com/translate/docs/authentication)。此流程无需安装 SDK 或下载服务账号 JSON。Google 要求启用结算，请查看其价格并设置合适的用量配额。

点击已选文件名可换文件；**Unlink** 只取消关联，不删除文件。程序保存文件路径，不复制文件；密钥用于验证发给 Google 的请求。移动文件后需重新选择，请勿公开密钥。

### 界面与日常使用

[查看界面截图](docs/store/assets/promo-original.png)。截图启用了两种翻译器；仅启用 Codex 时可能不显示切换项。

| 控件 | 用途 |
| --- | --- |
| 右上角开关 | 显示或隐藏双语字幕，不改变播放器自身字幕。 |
| Language | 选择译文语言；不同语言、翻译器分别保存译文。 |
| Log in / Log out | 登录或退出 Codex；确认退出会停止翻译，也可能影响本机共用该登录的其他应用。 |
| Translation program：Stop | 停止程序，点击 **Connect** 可再次启动。 |
| Size | 调整字号；在视频上上下拖动字幕可调整位置，位置会被记住。 |
| Retry | 解决报错后重新尝试。 |
| Translate again | 整集完成后确认重新翻译，会再次消耗额度。 |
| Copy diagnostics | 复制用于反馈问题的诊断信息。 |

再次观看时自动加载缓存；关闭视频会停止其翻译，重新打开后从已保存进度继续。广告期间隐藏字幕，正片恢复后重新显示。Disney+ 提示同步时，将鼠标移到视频上或暂停一次。两套字幕重叠时，单独调整播放器原生字幕。扩展更新后请刷新视频页。

**Translate again** 会暂时清空画面字幕，并随新翻译逐步显示；中途停止时恢复此前译文，全部完成后才替换保存版本。

### 常见问题

| 问题 | 处理方法 |
| --- | --- |
| 无法连接 / 找不到程序 | 在完整解压后的程序文件夹运行 **Start Subtitles**，再点 **Connect**；仍失败时运行同目录的 **Check Environment**。 |
| Codex 未安装 | 运行 **Set Up Codex**，等待完成后重试。 |
| Not logged in | 点击 **Log in** 并完成浏览器登录。 |
| 额度或账号错误 | 解决账号问题或等待额度恢复后重试。 |
| 没有字幕 | 检查开关、网站是否支持、视频是否有英文字幕，并查看具体报错。 |
| 扩展无法连接视频页 | 刷新页面；按报错要求重新加载扩展。 |
| Google 密钥文件无法读取 | 重新选文件并确认其中只有密钥；API 或账号错误参照上方教程处理。 |
| Disney+ 时间不对 | 按同步提示操作，仍异常时反馈。 |

反馈时点击 **Copy diagnostics**，再点击 **Report an issue**，提供系统、浏览器和扩展版本、网站、表现及复现步骤。发布前检查诊断文本与截图，不要附上 API key 或登录信息。macOS、含广告套餐和长时间播放的实测覆盖尚不如主要的 Windows 流程完整。

### 隐私与本地数据

Smart Subtitles 不运营后台、账号系统、分析或跟踪服务。原字幕、译文、设置和日志存于本机；待翻译文本直接发给所选服务，适用其条款和数据政策。首次翻译需要联网并使用个人服务账号，缓存译文在本地复用。

清除译文和日志时，先停止程序，再删除程序目录中的 `data` 和 `logs` 文件夹。停用时移除 Chrome 扩展并停止程序；要保留数据，请保留程序文件夹。详见[条款与隐私](https://jinzhou5042x.github.io/smart-subtitles/)。

### 后续计划与贡献

计划增加 **DeepSeek、Claude、Qwen 和本机运行的模型**等翻译器，并支持更多视频网站；这些目前尚未提供。欢迎贡献翻译器适配、网站支持、修复、测试、文档和翻译质量反馈。较大改动欢迎先提 issue 讨论，也欢迎提交 pull request。

### 开发者

安装 **Git、Node.js 22.13 及以上**；macOS 还需 Xcode Command Line Tools，用于原生文件选择器。克隆并构建：

```sh
git clone https://github.com/jinzhou5042x/smart-subtitles.git
cd smart-subtitles
npm run build
```

1. 运行 **Set Up Codex.cmd** / **Set Up Codex.command** 安装并登录 Codex。
2. 打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，加载 `dist/extension`。
3. 复制该扩展 ID，在 `config/local.json` 合并 `"extensionIds": ["你的扩展ID"]`，保留已有设置。
4. 运行 **Start Subtitles.cmd** / **Start Subtitles.command** 注册连接并启动程序。
5. 修改后运行 `npm run build`，重新加载扩展并刷新视频页。

启用 Google：在 `config/local.json` 合并 `"providers": ["codex", "google"]`，重启程序，再通过扩展选择密钥文件。该配置不提交 Git；模型及推理强度也可在此通过 `model`、`effort` 调整。

验证与打包命令为 `npm test`、`npm run check:browser`、`npm run package`、`npm run release`。扩展 ZIP 输出到 `dist/store/`；翻译程序按当前平台构建，macOS 包需在 macOS 构建。网站适配器位于 `extension/players/`，网站注册表位于 `extension/sites.js`，翻译代码位于 `service/`，测试位于 `tests/`。请勿提交密钥、本机配置、日志或用户数据。

---

Unofficial; not affiliated with Hulu, Disney or other streaming services. For personal, non-commercial use. 本项目为非官方工具，与上述流媒体服务无隶属关系，仅供个人非商业使用。
