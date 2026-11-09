# Queen's Blood Classic

[English](README.md)

这是面向《最终幻想 VII》玩家的非官方开源单机 Queen's Blood 游戏。包含 3×5 棋盘、可配置 Bot、卡组编辑、换牌、对局存档、回放、策略分析，以及全部 145 张 Classic Art 路线的本地生成器。

## 开始游戏

- **Windows 便携预览版：** 从 [GitHub Releases](https://github.com/Zaxaerith/ff7-QueensBloodClassic/releases) 下载 `v0.8.0-rc.2` ZIP，完整解压后运行 `QueensBloodClassic.exe`。需要单独安装 Microsoft Edge WebView2 Runtime。此预览版尚未在干净 Windows 虚拟机中测试。
- **浏览器：** 安装 Node.js 22.12 或更新版本，运行 `npm ci` 和 `npm run dev`，再打开 Vite 显示的本机地址。普通 Web 构建不包含生成后的私人卡图。

## Classic Art 卡图

仓库包含 145 张卡的配方和本地导入工具，不包含 FF7 游戏档案、提取模型或纹理，也不包含生成后的私人卡图。请自行准备合法取得的 FF7 Original PC 游戏资源，然后使用 Windows 版的 **Generate Art Pack**，或运行 `python tools/qb-assets.py inspect --source <游戏资源目录>`。生成卡包需要 Python 3.11+ 和 Pillow：`python -m pip install -r tools/requirements-art.txt`。详细步骤见[本地生成指南](docs/LOCAL_ART_GENERATOR.md)。生成的私人卡包可在桌面版或浏览器导入；原始游戏文件和生成卡图应留在自己的设备上。

## 构建与测试

构建 Web 游戏：运行 `npm ci`、`npm run check`、`npm test` 和 `npm run build`。Windows 桌面版见[构建说明](desktop/README.md)。Windows 需另行安装 WebView2 Runtime。

## 当前限制

#134 J-Squad 规则尚未完成；部分复杂规则仍为候选实现；卡牌美术仍可精修。Windows 预览版尚未完成独立干净虚拟机兼容测试。

## 许可证

项目源码采用 GPL-3.0-only，见 [LICENSE](LICENSE) 和[第三方来源说明](THIRD_PARTY_NOTICES.md)。本项目是非官方同人作品，与 Square Enix 无关联，也未获其认可。Final Fantasy VII 及相关名称与素材归其各自权利人所有。GPL 仅覆盖本仓库源码，不授予第三方游戏素材或角色的权利。
