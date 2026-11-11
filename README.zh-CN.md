# Queen's Blood Classic

[English](README.md)

这是面向《最终幻想 VII》玩家的非官方开源单机 Queen's Blood 游戏。本次为**仅源码预览版**，目前没有通过验收的 Windows 二进制发行包。包含 3×5 棋盘、可配置 Bot、卡组编辑、换牌、对局存档、回放、策略分析，以及 145 张 Classic Art 候选实现的本地生成工具。

## 开始游戏

- **Windows：** 本次源码预览尚无通过验收的 Windows 二进制包；桌面构建仍在验证中，本次 Release 不含 EXE。
- **浏览器：** 安装 Node.js 22.12 或更新版本，运行 `npm ci` 和 `npm run dev`，再打开 Vite 显示的本机地址。普通 Web 构建不包含生成后的私人卡图。

## Classic Art 卡图

仓库包含 145 张卡的配方和本地导入工具，不包含 FF7 游戏档案、提取模型或纹理，也不包含生成后的私人卡图。请自行准备合法取得的 FF7 Original PC 游戏资源，然后使用 Windows 版的 **Generate Art Pack**，或运行 `python tools/qb-assets.py inspect --source <游戏资源目录>`。生成卡包需要 Python 3.11+ 和 Pillow：`python -m pip install -r tools/requirements-art.txt`。详细步骤见[本地生成指南](docs/LOCAL_ART_GENERATOR.md)。生成的私人卡包可在桌面版或浏览器导入；原始游戏文件和生成卡图应留在自己的设备上。

## 构建与测试

构建 Web 游戏：运行 `npm ci`、`npm run check`、`npm test` 和 `npm run build`。Windows 桌面版见[构建说明](desktop/README.md)。维护者通过[云端发行工作流](docs/CLOUD_RELEASE.md)构建和发布 Windows 包；本地 ZIP 不作为发行附件。Windows 需另行安装 WebView2 Runtime。

## 当前限制

#134 已有可执行的 J-Squad 候选规则，但与原作的一致性尚未完全核验；部分复杂规则仍为候选实现；卡牌美术仍可精修。目前没有通过验收的 Windows 二进制，也未完成独立干净 Windows 虚拟机兼容测试。

## 许可证

项目源码采用 GPL-3.0-only，见 [LICENSE](LICENSE) 和[第三方来源说明](THIRD_PARTY_NOTICES.md)。本项目是非官方同人作品，与 Square Enix 无关联，也未获其认可。Final Fantasy VII 及相关名称与素材归其各自权利人所有。GPL 仅覆盖本仓库源码，不授予第三方游戏素材或角色的权利。
