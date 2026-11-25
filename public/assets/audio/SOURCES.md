# LudoDrop audio sources

The case and reel WAV files were extracted directly from the user's locally installed Counter-Strike 2 VPK archives on 2026-11-06.

Source installation: `C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo`

The source archives are the `pak01_dir.vpk` index and its indexed `pak01_NNN.vpk` chunks. For the case and reel files, the original `vsnd_c` PCM streams are preserved byte-for-byte behind standard WAV headers. Sample rate, channel count, bit depth and duration were taken from resource metadata and validated against the resulting WAV. PCM stream hashes and metadata are in `manifest.json`.

The resource layout was cross-checked against the open source [ValveResourceFormat Sound reader](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/ValveResourceFormat/Resource/ResourceTypes/Sound.cs) and [BinaryKV3 reader](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/ValveResourceFormat/Resource/ResourceTypes/BinaryKV3.cs). A small in-memory parser read only the requested resources. No third-party extractor binaries were installed.

The following case and reel recordings and the Counter-Strike trademarks belong to Valve and their respective creators.

| File | Original resource | Duration |
| --- | --- | --- |
| `tick.wav` | `sounds/ui/csgo_ui_crate_item_scroll.vsnd_c` | 0.583 s |
| `unlock.wav` | `sounds/ui/panorama/case_unlock_immediate_01.vsnd_c` | 0.457 s |
| `unlock-full.wav` | `sounds/ui/panorama/case_unlock_01.vsnd_c` | 3.773 s |
| `reveal.wav` | `sounds/ui/panorama/case_reveal_rare_01.vsnd_c` | 3.926 s |
| `reveal-purple.wav` | `sounds/ui/panorama/case_reveal_mythical_01.vsnd_c` | 3.722 s |
| `reveal-pink.wav` | `sounds/ui/panorama/case_reveal_legendary_01.vsnd_c` | 4.319 s |
| `rare.wav` | `sounds/ui/panorama/case_reveal_ancient_01.vsnd_c` | 5.367 s |

`reveal.wav` is the blue (rare) item reveal; `reveal-purple.wav` is the purple (mythical) reveal; `reveal-pink.wav` is the pink (legendary) reveal; `rare.wav` is the red (ancient/covert) reveal and can be reused for gold drops. Gold reuse is an application choice, not a claim that the original resource is knife-specific. `unlock.wav` is the short immediate unlock cue; `unlock-full.wav` is the longer full case-unlock cue. No soundtrack, voice, or unrelated game files were copied.

## Playback and additional effects

The upgrade wheel shares the case reel's `tick.wav` from Counter-Strike 2. The transient of the 27 ms edit lines up with the pointer crossing each major dial mark. The visual and audio playback clocks are aligned on launch and on return to the tab.

The screw cap uses a short filtered friction and release cue. Opening a pin packet plays one tearing movement and a crinkle, synthesized with Web Audio.

Case opening starts with the short latch sample from `unlock.wav`. A card boundary passing under the pointer triggers `tick.wav`. The frame that stops the reel triggers a synthesized mechanical stop. The rarity reveal follows the settling pause. Red and gold reveals add a low synthesized tone. UI clicks, gem, win and loss effects also use Web Audio noise and oscillator layers. The master gain applies volume and mute to playback. The longer `unlock-full.wav` remains in the original asset archive.
