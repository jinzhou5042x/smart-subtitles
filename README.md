# Smart Subtitles

[English](#english) | [中文](#中文)

## English

A Chrome extension that adds translated subtitles to **Hulu and Disney+**, alongside the original English. It also works with Hulu shows inside Disney+.

Pick a language, open a video, and let it translate. You can change the text size or drag the subtitles out of the way. Finished translations stay on your computer, so watching the same episode again doesn't mean translating it again.

[Install the extension](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) · [Download the translation program](https://github.com/jinzhou5042x/smart-subtitles/releases) · [Issues](https://github.com/jinzhou5042x/smart-subtitles/issues)

### Setup

You'll need **Chrome 127+**, **Windows x64 or macOS 13+**, and a video with English subtitles. There are 55 target languages to choose from. Netflix, YouTube and live TV aren't supported yet.

There are two things to install: the Chrome extension and a small program that handles translation on your computer. The download includes what it needs to run; you don't need Node.js or any developer tools.

1. Install the extension from the link above. Pin it in Chrome's Extensions menu so you can find it.
2. Download the program for your computer: Windows x64, Mac Apple Silicon (`darwin-arm64`), or Mac Intel (`darwin-x64`). Unzip it somewhere you plan to keep it.
3. Double-click **Set Up Codex.cmd** on Windows or **Set Up Codex.command** on Mac. Follow the ChatGPT sign-in in your browser and wait for setup to finish.
4. Open a Hulu or Disney+ video, click the extension, and choose your **Language**. Make sure the top-right switch is on. If you see **Connect**, click it.

Once Codex says **Logged in** and the program says **Running**, you're ready. Subtitles appear as they're translated—you don't have to wait for the whole episode.

That's the one-time setup. The extension starts the program for you afterward. If you move its folder, run **Start Subtitles** once from the new location. If macOS blocks a launcher you trust, use Finder's **Open** action or **System Settings → Privacy & Security**.

Using Google instead? Skip the Codex sign-in, run **Start Subtitles** once, and follow the Google section below.

### Codex or Google?

**Codex is the default.** It uses your ChatGPT login and reads the episode for context, which helps with dialogue that doesn't make sense one subtitle at a time.

The model is **GPT-6 Luna, with reasoning set to low** (`gpt-6-luna` / `low`). The idea is to spend fewer tokens on reasoning for an everyday task like subtitles. It still counts toward your Codex usage, so a long viewing session can eat into the allowance you use elsewhere.

You'll need a ChatGPT plan that includes GPT-6 Luna in Codex. Plus is currently listed at **US$20/month**; check [OpenAI's pricing](https://learn.chatgpt.com/docs/pricing) before subscribing. Smart Subtitles itself is free.

**Google Cloud Translation** is the other option. It translates subtitles individually and uses your own API key, with charges going to your Google Cloud account. The release defaults to Codex only. If you don't see Google, the setting to enable it is under [For developers](#for-developers).

#### Getting a Google API key

This is the fiddliest part of the Google setup. Google's [setup guide](https://docs.cloud.google.com/translate/docs/setup) and [API key guide](https://docs.cloud.google.com/docs/authentication/api-keys#create) cover it in detail. The short version:

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project, or select one you already have.
2. Enable billing for that project. Then go to **APIs & Services → Library**, find **Cloud Translation API**, and enable it.
3. Go to **APIs & Services → Credentials → Create credentials → API key**. Restrict the key to **Cloud Translation API**.
4. Put just the key in a UTF-8 text file on your computer.
5. In the extension, select **Google**, click **Choose file…** next to **API key**, and pick that file.

Use **Cloud Translation Basic (v2)**. You don't need an SDK or a service-account JSON file; [Advanced (v3) doesn't accept API keys](https://docs.cloud.google.com/translate/docs/authentication). Billing must be enabled, so check Google's rates and set a usage quota you're comfortable with.

Keep the key file somewhere private and don't move it afterward—the program remembers its location. To change it, click the filename in the extension. **Unlink** forgets the file without deleting it. There's also a **How to get one** link in the extension if you need these instructions later.

### While watching

<img src="docs/store/assets/promo-original.png" alt="The Smart Subtitles popup" width="354">

This screenshot has both translators enabled. With only Codex enabled, you may not see the translator selector.

Use **Size** to change the text size, or drag the subtitles up and down on the video. The position is saved. The top-right switch hides the bilingual subtitles; it doesn't change the player's own captions. If you see two overlapping sets, turn off the player's captions yourself.

Translations are saved separately for each language and translator. Close a video and translation stops; come back and it resumes from saved progress. During ads, subtitles stay hidden until the show returns. On Disney+, a sync prompt may ask you to move your pointer over the video or pause once.

Want another attempt at a finished episode? Click **Translate again**. It uses your allowance again and clears the displayed subtitles while the new ones arrive. If the attempt stops, the old translation comes back; the saved copy is replaced only when the new one finishes.

**Stop** quits the translation program, and **Connect** starts it again. **Log out** signs Codex out on this computer, including other apps sharing that login, so it asks you to confirm.

### If something goes wrong

- **Can't connect:** run **Start Subtitles** from the program folder, then click **Connect**. If that doesn't help, run **Check Environment** in the same folder.
- **Codex isn't installed or logged in:** run **Set Up Codex** for installation, or use **Log in** in the extension.
- **No subtitles:** check that the switch is on and the video has English subtitles. Open the extension to see any error.
- **Quota error:** wait for your allowance to reset or sort out the account issue, then retry.
- **Google can't read the key:** select the file again and check that it contains only the key.
- **Things broke after an update:** refresh the video page. Reload the extension too if the error asks you to.

If you're still stuck, click **Copy diagnostics** and paste the result into an [issue](https://github.com/jinzhou5042x/smart-subtitles/issues). Tell us your OS, browser and extension versions, which site you were watching, and what happened. Don't post your API key or login details.

Windows has had the most testing so far. Mac, ad-supported plans and long sessions could use more real-world testing; reports from those setups are especially useful.

### Where your data goes

There's no Smart Subtitles account, backend or analytics. Subtitles, translations, settings and logs stay on your computer. The text you ask to translate goes directly to OpenAI through Codex or to Google, using your account. Their terms and data policies still apply.

To clear saved translations and logs, stop the program and delete its `data` and `logs` folders. To stop using it, remove the extension and stop the program. [Terms & Privacy](https://jinzhou5042x.github.io/smart-subtitles/).

### What's next

I'd like to add **DeepSeek, Claude, Qwen and local models**, along with more video sites. None of those translators are wired up yet.

PRs are welcome. If you want to add a translator or a site, open an issue first so we can work out the approach. Bug reports, awkward translations, docs fixes and testing on a different machine all help too.

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

看 Hulu、Disney+，但想要的语言没有字幕？这个扩展会把英文字幕翻译出来，和原文一起显示在视频上。Disney+ 里的 Hulu 内容也能用。

选好语言就可以开始看，字号和位置都能调。翻译过的内容保存在自己电脑上，下次重看不用再翻一遍。

[安装扩展](https://chromewebstore.google.com/detail/bpfhbkkdmommobklkndkfagejfpbnjno) · [下载翻译程序](https://github.com/jinzhou5042x/smart-subtitles/releases) · [反馈问题](https://github.com/jinzhou5042x/smart-subtitles/issues)

### 怎么装

需要 **Chrome 127+**，系统支持 **Windows x64、macOS 13 及以上**。视频必须有英文字幕，可以翻译成包括中文在内的 55 种语言。目前还不能用于 Netflix、YouTube 或直播电视。

一共装两个东西：Chrome 扩展，以及在电脑上负责翻译的小程序。下载包自带运行环境，不用自己装 Node.js，也不用懂编程。

1. 点上面的链接安装扩展，建议在 Chrome 扩展菜单里把它固定下来。
2. 下载对应系统的翻译程序：Windows x64、Mac Apple Silicon（`darwin-arm64`）或 Mac Intel（`darwin-x64`）。完整解压到一个以后不会随手删掉的文件夹。
3. Windows 双击 **Set Up Codex.cmd**，Mac 双击 **Set Up Codex.command**。按提示在浏览器里登录 ChatGPT，等配置完成。
4. 打开 Hulu 或 Disney+ 视频，点扩展图标，在 **Language** 里选 **Chinese (Simplified)** 或其他语言。右上角开关要打开；如果显示 **Connect**，点一下。

看到 Codex 显示 **Logged in**、程序显示 **Running**，就可以用了。字幕边翻译边出现，不用等整集翻完。

这些只需要配置一次，以后扩展会自动启动程序。如果移动了文件夹，在新位置运行一次 **Start Subtitles** 就行。Mac 如果拦截了你确认可信的启动文件，可以通过 Finder 的“打开”或“系统设置 → 隐私与安全性”放行。

如果打算用 Google，可以跳过 Codex 登录，运行一次 **Start Subtitles**，然后看下面的密钥配置。

### 用哪个翻译器

**默认用 Codex。** 直接登录自己的 ChatGPT 账号，会结合整集上下文翻译，对需要联系前后文才能看懂的对白比较有帮助。

模型用的是 **GPT-6 Luna，推理强度 low**（`gpt-6-luna` / `low`）。字幕这种日常任务，选择 low 是为了少花一些推理 token。不过它还是会占用你的 Codex 额度，连续看很多集，也会挤占你做其他事情的额度。

账号需要能在 Codex 中使用 GPT-6 Luna。Plus 目前标价是 **20 美元/月**，订阅前看一下 [OpenAI 官方价格](https://learn.chatgpt.com/docs/pricing)。Smart Subtitles 本身免费。

**也可以用 Google Cloud Translation。** 它逐条翻译字幕，需要自己的 API key，费用记在自己的 Google Cloud 账号上。发行包默认只开了 Codex；没看到 Google 选项的话，[开发者部分](#开发者)有开启方法。

#### Google 的 key 怎么申请

Google 这一步稍微麻烦一点。可以跟着官方的[翻译服务配置教程](https://docs.cloud.google.com/translate/docs/setup?hl=zh-cn)和[创建 API key 教程](https://docs.cloud.google.com/docs/authentication/api-keys?hl=zh-cn#create)操作，主要就是这几步：

1. 登录 [Google Cloud Console](https://console.cloud.google.com/)，新建一个项目，或者选已有项目。
2. 给项目启用结算，再到 **API 和服务 → 库**，搜索并启用 **Cloud Translation API**。
3. 到 **API 和服务 → 凭据 → 创建凭据 → API 密钥**，把密钥的 API 限制设为 **Cloud Translation API**。
4. 把密钥单独放进一个 UTF-8 文本文件，文件里不要写其他内容。
5. 在扩展里选择 **Google**，点 **API key** 旁边的 **Choose file…**，选中这个文件。

这里用的是 **Cloud Translation Basic（v2）**，不用装 SDK，也不用下载服务账号 JSON。[Advanced（v3）不支持 API key](https://docs.cloud.google.com/translate/docs/authentication)，别配错了。Google 要求启用结算，建议看清价格，再设一个合适的用量配额。

密钥文件放好以后尽量别移动，程序记的是它的位置。需要换文件时点扩展里的文件名；**Unlink** 只解除关联，不会删除文件。不要把密钥发到 GitHub。扩展里也有 **How to get one** 链接，忘了步骤可以随时打开。

### 看视频时

[界面截图](docs/store/assets/promo-original.png)里启用了两种翻译器；只开 Codex 时可能看不到切换按钮。

**Size** 调字号，直接在视频上上下拖动字幕就能调位置，下次还会记住。右上角开关只控制这个扩展的字幕，不会替你关掉播放器原来的字幕。如果两套字幕叠在一起，手动关掉播放器那一套就行。

不同语言、不同翻译器的译文分开保存。关闭视频就停止翻译，重新打开后从保存的进度接着翻。广告期间字幕会隐藏，回到正片后再出现。Disney+ 有时会提示同步，把鼠标移到视频上，或者暂停一下即可。

整集翻完后，不满意可以点 **Translate again** 再试一次，但会再次消耗额度。重翻时画面上的字幕先清空，再逐步显示新的；如果中途停止，会恢复旧译文，只有全部完成后才替换保存的版本。

**Stop** 关闭翻译程序，**Connect** 重新启动。**Log out** 会退出这台电脑上的 Codex 登录，其他共用这个登录的应用也会受影响，所以会再让你确认一次。

### 出问题了怎么办

- **连不上程序：** 在解压后的文件夹里运行 **Start Subtitles**，再点 **Connect**。还不行就运行同目录的 **Check Environment**。
- **Codex 没装好或没登录：** 安装问题重新运行 **Set Up Codex**；没登录就点扩展里的 **Log in**。
- **不出字幕：** 先看开关是否打开、视频有没有英文字幕，再打开扩展看具体报错。
- **额度不够：** 等额度恢复，或者处理账号问题之后再重试。
- **读不到 Google 密钥：** 重新选一下文件，确认里面只有密钥。
- **更新后突然不能用了：** 刷新视频页面；报错要求重新加载扩展的话，也一起操作。

还解决不了的话，点 **Copy diagnostics**，把结果贴到 [issue](https://github.com/jinzhou5042x/smart-subtitles/issues) 里。说一下系统、浏览器和扩展版本、在哪个网站、具体发生了什么。别贴 API key 或登录信息。

目前 Windows 测得最多，Mac、含广告套餐和连续长时间播放还需要更多实测。如果你在这些环境下碰到问题，欢迎反馈。

### 数据放在哪里

没有 Smart Subtitles 账号，也没有我这边的服务器或统计后台。字幕、译文、设置和日志都保存在你的电脑上。翻译时，文本会用你自己的账号直接发给 OpenAI 或 Google，仍然适用他们的数据政策和条款。

想清掉翻译记录和日志，先停止程序，再删掉程序目录里的 `data` 和 `logs` 文件夹。不用了就卸载扩展、停止程序。[条款与隐私](https://jinzhou5042x.github.io/smart-subtitles/)里有更完整的说明。

### 接下来想做的

后面想接入 **DeepSeek、Claude、Qwen，还有自己电脑上跑的模型**，也想支持更多视频网站。这些目前还没接好。

欢迎一起写。如果想加翻译器或网站支持，可以先开个 issue 聊聊怎么做。提 bug、指出翻译不对的地方、改文档，或者帮忙在不同电脑上试一试，也都很有用。

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

Unofficial; not affiliated with Hulu, Disney or other streaming services. For personal, non-commercial use.
本项目与上述流媒体服务无隶属关系，仅供个人非商业使用。
