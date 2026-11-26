Queen's Blood Classic — Windows x64 Portable (v1.0.0)
非官方同人作品，与Square Enix无官方关联。Unofficial fan project.

Windows 10/11 x64; .NET Framework 4.6.2+; Microsoft Edge WebView2 Evergreen.
无需Python、Pillow、Node或npm。No developer tools required at runtime.
WebView2官方安装地址 / official runtime:
https://developer.microsoft.com/en-us/microsoft-edge/webview2/
本程序不自动下载安装器。Missing runtime is reported before opening Game.

解压整个文件夹，运行 QueensBloodClassic.exe，保留 _internal 和 qb-assets-worker.exe。
Extract the whole folder; run QueensBloodClassic.exe without administrator rights.

【FF7 OG 启动器 v2 / Launcher v2】
- 首次启动可点击「自动探测 Steam 目录」或手动选择合法取得的 Steam 英文版 FF7 Original 目录，一键校验并离线生成 145 张私人卡图；
- 也可直接挂载已完成的 145 卡或含代币 166 卡完整 Art Pack，或跳过卡图以经典字形模式立即游玩；
- 内置 11 项 1997 PS1 风格程序化合成音效，无需外部音频；如需本地 BGM 循环，可选挂包含 audio-pack.local.json 的本地音乐包目录；
- 首次启用完整卡包后默认勾选「下次启动直接进入游戏」；无图模式可手动启用。后续启动将校验已保存卡包/音乐包；可在游戏设置或窗口菜单「Desktop → Launcher & Resource Setup」返回启动器。

First launch: auto-detect or select your legally acquired Steam English FF7 Original installation to verify and build 145 private portraits offline, load an existing 145/166 Art Pack, or play immediately in Classic Glyph mode. Optional local BGM packs (audio-pack.local.json) can also be mounted read-only alongside the 11 built-in PS1 synth SFX. After enabling a complete Art Pack, direct launch is enabled by default; in glyph mode, you can enable it manually. Saved packs are verified on startup; return via game settings or Desktop -> Launcher & Resource Setup.

首轮全量生成约需 15–20 分钟，取消可能等待当前处理阶段结束。
Cancellation is cooperative. Incomplete/failed packs cannot be loaded.
重试使用新目录，不覆盖旧包；不要下载来路不明的模型/LGP。

用户数据位置记录: Windows Saved Games/QueensBloodClassicDesktop/data-location.json.
新用户默认在该目录的 data 子目录。检测到旧 LocalAppData 数据时明确询问是否沿用。
Data location is recorded under Windows Saved Games; legacy data requires confirmation.
存档、卡组、Records、回放、WebView2 及私人包与程序目录分离。
Upgrade: extract a new ZIP elsewhere. Never delete the user data folder.
历史开发样机如使用了不同 --data-dir，必须显式使用原目录；不自动搬迁。
Old development profiles using --data-dir require that same explicit path.
端口 38771 占用会报错，不连接占用者、不更改存档来源。
If port 38771 is occupied, close the other copy; no automatic port change.
缺少 LGP 时检查安装路径与英文资源布局；失败详情见向导及 build-report.json。
强制结束/断电可能遗留 in-progress 目录；保留诊断，用新目录重试。

生成图片与本地音频仅供个人本机使用，不随本 ZIP 分发。No game assets are included.
GPL project source is in source.zip; dependency notices are under licenses/.
This is a local unsigned candidate, not an installer or public release.
