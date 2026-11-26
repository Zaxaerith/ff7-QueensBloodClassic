# Queen’s Blood Classic

[English](README.md)

这是受 Queen’s Blood 启发的非官方开源单机卡牌游戏。当前版本 **1.0.0** 提供完整 Classic 候选体验。

## 功能

- 3×5 棋盘、145 张编号卡牌定义、牌组编辑、换牌、对局存档、回放和对局分析。
- 三档 Bot、20 名世界巡礼对手、暗影血女王，以及键盘和手柄操作。
- 第八神罗丸锦标赛、金碟特殊挑战与生存赛。
- 11 种界面语言与 Classic Frame 风格界面。
- 可选的本地 BGM 播放、音量与静音设置；仓库不含音乐文件。
- Card Carnival 包含 22 关可玩的 Classic 候选谜题。
- 145 张 Classic Art 卡牌的候选本地生成路线。

部分复杂卡牌互动仍属于候选规则。#066 Two Face 的反馈行为和 #134 J-Squad 细节仍待对照原作核验。

## 浏览器运行

安装 Node.js 22.12 或更新版本，然后运行：

```sh
npm ci
npm run dev
```

打开 Vite 显示的本机地址。普通 Web 构建无需卡图即可运行，也不含私人生成图片。

## 本地生成并导入私人卡图

请自行准备合法取得的 FF7 Original PC 游戏资源。仓库包含 145 张卡的本地生成器和候选配方，但不含原版游戏档案、提取模型或纹理，也不含生成后的私人卡图。请按[本地生成指南](docs/LOCAL_ART_GENERATOR.md)操作，再将生成的 Art Pack 导入桌面版或浏览器。公开生成器不保证复现任何私人美术收藏中的全部精修细节。

## Windows 桌面源码

仓库包含桌面宿主和[构建说明](desktop/README.md)。本次源码预览不提供通过验收的 Windows 二进制；Windows GUI 人工验收和独立干净虚拟机兼容测试尚未完成。

## 构建与检查

```sh
npm ci
npm run check
npm test
npm run build
```

另见[玩法与当前限制](docs/GAMEPLAY.md)、[本地音乐设置](docs/LOCAL_AUDIO.md)、[Art Pack v1 契约](docs/ART_PACK_CONTRACT.md)和[第三方来源说明](THIRD_PARTY_NOTICES.md)。

## 许可证与项目说明

项目源码采用 GPL-3.0-only，见[许可证](LICENSE)。本项目是非官方同人作品，与 Square Enix 无关联，也未获其认可。Final Fantasy VII 及相关名称和素材归其各自权利人所有。GPL 仅覆盖本仓库源码，不授予第三方游戏素材或角色的权利。
