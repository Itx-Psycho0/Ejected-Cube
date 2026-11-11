"""
Generates the game's voice-over with Piper (offline neural TTS) and ffmpeg.

Voice model: en_US "joe" medium, CC0-1.0, as packaged on npm in
`vowel-lab-voices-float@0.1.0` (float.onnx). Usage:

    python -m venv venv && venv/bin/pip install piper-tts
    npm pack vowel-lab-voices-float@0.1.0 && tar xzf vowel-lab-voices-float-0.1.0.tgz
    venv/bin/python scripts/make-voice.py package/float.onnx src/audio/voice

Each line is synthesised, then shaped per character with ffmpeg:
narrator (warm, slow, light hall), announcer (punchy, echo) and the Blot
(pitched far down, doubled, long dark reverb).
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

from piper import PiperVoice
from piper.config import SynthesisConfig
from piper.phoneme_ids import DEFAULT_PHONEME_ID_MAP

LINES = {
    # --- story ---
    "story-1": ("narrator", "Before there were maps, there was the Atlas. A book where every page was a whole world."),
    "story-2": ("narrator", "At its heart turned the Atlas Engine. And one small cube of light kept every page turning."),
    "story-3": ("narrator", "Then a single drop of ink fell. It learned to think. It called itself the Blot... and it wanted every page for itself."),
    "story-4": ("narrator", "With its last turn, the Engine did the only thing it could. It threw the cube out, into the pages."),
    "story-5": ("narrator", "Now the Blot sends its creatures after you, each one stained with its ink. Gather the light. Find the way home."),
    "story-6": ("narrator", "And when the ink finally comes for you itself... do not look away."),
    "ending-1": ("narrator", "The Blot came at last. And the cube did not look away."),
    "ending-2": ("narrator", "The ink scattered. The gears caught. The pages flew home. The Atlas is whole again... for now. Ink never quite dries."),
    # --- boss warnings ---
    "warn-1": ("announcer", "Warning. Something big is coming."),
    "warn-2": ("announcer", "Warning. The ink has taken shape."),
    "warn-final": ("announcer", "Warning. It is the Blot itself."),
    "boss-warden": ("announcer", "The Thermal Warden."),
    "boss-lantern": ("announcer", "The Lantern."),
    "boss-chain": ("announcer", "The Chain."),
    "boss-kraken": ("announcer", "The Kraken."),
    "boss-leviathan": ("announcer", "Leviathan."),
    "boss-storm": ("announcer", "The Thunderhead."),
    "boss-zeppelin": ("announcer", "The Ironclad Airship."),
    "boss-dragon": ("announcer", "The Kite Dragon."),
    "boss-core": ("announcer", "The Sentinel Core."),
    "boss-dreadnought": ("announcer", "The Dreadnought."),
    "boss-wyrm": ("announcer", "The Star Wyrm."),
    "boss-blot": ("announcer", "The Blot."),
    "victory": ("announcer", "Boss defeated."),
    # --- the villain, between pages ---
    "blot-1": ("blot", "You took one of mine. I have so many more."),
    "blot-2": ("blot", "Every page you cross... I have already touched."),
    "blot-3": ("blot", "Your light is getting smaller, little cube."),
    "blot-4": ("blot", "Come, then. Come to the last page."),
    "blot-taunt": ("blot", "There you are."),
    "blot-defeat": ("blot", "No... not like this... not on my page."),
}

CHAIN = {
    # rate tweak (asetrate) shifts pitch; atempo restores the speed.
    "narrator": "asetrate=22050*0.93,aresample=22050,atempo=1.0/0.93*0.97,"
    "equalizer=f=140:t=q:w=1:g=3,equalizer=f=3500:t=q:w=1:g=2,"
    "acompressor=threshold=-20dB:ratio=3:attack=5:release=120,"
    "aecho=0.8:0.6:60|120:0.18|0.1,loudnorm=I=-16:TP=-1.5",
    "announcer": "asetrate=22050*0.9,aresample=22050,atempo=1.0/0.9,"
    "highpass=f=90,equalizer=f=2500:t=q:w=1:g=4,"
    "acompressor=threshold=-24dB:ratio=6:attack=2:release=80,"
    "aecho=0.8:0.7:120|240:0.28|0.14,loudnorm=I=-14:TP=-1",
    "blot": "asetrate=22050*0.74,aresample=22050,atempo=1.0/0.74*0.92,"
    "lowpass=f=5000,equalizer=f=110:t=q:w=1:g=6,"
    "aecho=0.7:0.85:180|420|700:0.4|0.28|0.18,"
    "acompressor=threshold=-22dB:ratio=4,loudnorm=I=-16:TP=-1.5",
}

LENGTH = {"narrator": 1.12, "announcer": 1.05, "blot": 1.2}


def main(model: str, out_dir: str):
    cfg_path = model + ".json"
    if not os.path.exists(cfg_path):
        json.dump(
            {
                "audio": {"sample_rate": 22050},
                "espeak": {"voice": "en-us"},
                "phoneme_type": "espeak",
                "num_symbols": 256,
                "num_speakers": 1,
                "inference": {"noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8},
                "phoneme_id_map": DEFAULT_PHONEME_ID_MAP,
                "speaker_id_map": {},
            },
            open(cfg_path, "w"),
        )
    voice = PiperVoice.load(model, config_path=cfg_path)
    os.makedirs(out_dir, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for key, (role, text) in LINES.items():
            raw = os.path.join(tmp, key + ".wav")
            with wave.open(raw, "wb") as w:
                voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=LENGTH[role], noise_scale=0.6, noise_w_scale=0.7))
            chain = CHAIN[role]
            if role == "blot":
                # Double the villain with an octave-down copy for a hollow, inhuman voice.
                graph = f"[0:a]asplit[a][b];[a]{chain}[x];[b]asetrate=22050*0.5,aresample=22050,atempo=2.0,{chain},volume=0.45[y];[x][y]amix=inputs=2:normalize=0,apad=pad_dur=0.6"
            else:
                graph = f"[0:a]{chain},apad=pad_dur=0.5"
            dst = os.path.join(out_dir, key + ".mp3")
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", raw, "-filter_complex", graph, "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k", dst],
                check=True,
            )
            print(key)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
