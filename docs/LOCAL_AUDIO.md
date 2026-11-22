# Optional local music

The public source contains the BGM player and settings but no audio tracks. Without a private pack, the game starts silently, hides audio controls, and makes no audio requests.

To use audio you are entitled to use, keep it in the ignored `private-audio/` directory. Create `private-audio/audio-pack.json` with relative WAV paths:

```json
{
  "version": 1,
  "tracks": {
    "matchLoop": {
      "wav": "match-loop.wav",
      "loop": { "sampleRateHz": 44100, "startFrame": 0, "endFrameExclusive": 3432646 }
    },
    "victory": { "wav": "victory.wav" }
  }
}
```

Tracks must be stereo 16-bit PCM WAV files no larger than 16 MiB each. The loop end is exclusive and must fit the decoded track. The private development server reads only files inside `private-audio/` and listens on loopback. It does not copy tracks into public builds.

PowerShell:

```powershell
$env:QB_PRIVATE_AUDIO_CONFIG = 'private-audio/audio-pack.json'
npm run dev:private
```

macOS/Linux:

```sh
QB_PRIVATE_AUDIO_CONFIG=private-audio/audio-pack.json npm run dev:private
```

Do not commit audio tracks, MIDI, SoundFonts, samples, or source game music. The project provides no public soundtrack.

## 简体中文

公开源码包含 BGM 播放器和设置，但不含音轨。没有私人音频包时，游戏静音启动、隐藏音频控件，也不会请求音频资源。

只使用你有权使用的音频文件，并将其保留在被 Git 忽略的 `private-audio/` 目录中。创建 `private-audio/audio-pack.json`，使用相对于配置文件的 WAV 路径：

```json
{
  "version": 1,
  "tracks": {
    "matchLoop": {
      "wav": "match-loop.wav",
      "loop": { "sampleRateHz": 44100, "startFrame": 0, "endFrameExclusive": 3432646 }
    },
    "victory": { "wav": "victory.wav" }
  }
}
```

音轨必须是双声道、16 位 PCM WAV，每个文件不超过 16 MiB。循环终点采用排除式索引，且必须位于解码音轨范围内。私有开发服务器只读取 `private-audio/` 内的文件，并仅绑定本机回环地址；这些文件不会复制到公开构建中。

PowerShell：

```powershell
$env:QB_PRIVATE_AUDIO_CONFIG = 'private-audio/audio-pack.json'
npm run dev:private
```

macOS/Linux：

```sh
QB_PRIVATE_AUDIO_CONFIG=private-audio/audio-pack.json npm run dev:private
```

不要提交音轨、MIDI、SoundFont、采样或原作音乐。本项目不提供公开配乐。
