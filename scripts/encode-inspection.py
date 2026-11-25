"""Encode the transparent poses sent by render-inspection-fallback.mjs."""
from io import BytesIO
import json
from pathlib import Path
import struct
import sys
from tempfile import TemporaryDirectory

from PIL import Image

output = Path(sys.argv[1])
model = sys.argv[2]
regular_indices, quick_indices = json.loads(sys.argv[3])
frames = []
alpha_levels = [round(round(alpha * 32 / 255) * 255 / 32) for alpha in range(256)]
for _ in range(max(regular_indices[-1], quick_indices[-1]) + 1):
    length, = struct.unpack(">I", sys.stdin.buffer.read(4))
    with Image.open(BytesIO(sys.stdin.buffer.read(length))) as source:
        if source.size != (1024, 704) or "A" not in source.getbands():
            raise ValueError("Expected a transparent 1024 x 704 frame")
        frame = source.convert("RGBA")
    frame.putalpha(frame.getchannel("A").point(alpha_levels))
    frames.append(frame)


def durations(total, steps):
    return [round((i + 1) * total / steps) - round(i * total / steps) for i in range(steps)]


def animate(path, poses, times, quality):
    poses[0].save(path, save_all=True, append_images=poses[1:], duration=times, loop=1, quality=quality, method=4)


output.mkdir(parents=True, exist_ok=True)
with TemporaryDirectory(dir=output) as tmp:
    staging = Path(tmp)
    regular = staging / (model + ".webp")
    regular_poses = [frames[i] for i in regular_indices]
    times = durations(2100, len(regular_poses) - 1) + [200]
    times[0] += 120
    high_cadence = len(regular_indices) > 49
    animate(regular, regular_poses, times, 75 if high_cadence else 79)
    if not high_cadence and regular.stat().st_size > 1_000_000:
        animate(regular, regular_poses, times, 73)
    quick = [frames[i] for i in quick_indices]
    animate(staging / (model + "-fast.webp"), quick, durations(580, len(quick) - 1) + [100], 79)
    frames[0].save(staging / (model + "-closed.webp"), quality=86, method=4)
    frames[-1].save(staging / (model + "-open.webp"), quality=86, method=4)
    for path in staging.iterdir():
        path.replace(output / path.name)
