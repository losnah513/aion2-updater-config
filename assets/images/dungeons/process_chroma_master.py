from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


EXPEDITION = {
    "bakron-floating-island",
    "blue-breath-island",
    "corridor-of-illusion",
    "corrupted-deus-research-base",
    "cradle-of-nothingness",
    "dead-dramata-nest",
    "draupnir",
    "fallen-daeva-castle",
    "fire-temple",
    "krao-cave",
    "savage-horn-cavern",
    "urugugu-canyon",
}

TRANSCENDENCE = {
    "abyssal-horn-cavern",
    "deus-research-base",
    "noiran-hidden-legacy",
    "red-lotus-mirror",
    "shattered-arcanis",
    "sunken-temple-of-life",
}

KEY_MODE = {
    "abyssal-horn-cavern": "green",
    "bakron-floating-island": "magenta",
    "blue-breath-island": "magenta",
    "corridor-of-illusion": "magenta",
    "corrupted-deus-research-base": "magenta",
    "cradle-of-nothingness": "green",
    "dead-dramata-nest": "green",
    "deus-research-base": "magenta",
    "draupnir": "magenta",
    "fallen-daeva-castle": "magenta",
    "fire-temple": "green",
    "krao-cave": "green",
    "noiran-hidden-legacy": "magenta",
    "red-lotus-mirror": "green",
    "savage-horn-cavern": "magenta",
    "shattered-arcanis": "magenta",
    "sunken-temple-of-life": "green",
    "urugugu-canyon": "blue",
}


def matte(rgb: np.ndarray, mode: str) -> np.ndarray:
    pixels = rgb.astype(np.float32)
    red, green, blue = pixels[..., 0], pixels[..., 1], pixels[..., 2]

    if mode == "magenta":
        keyness = np.minimum(red, blue) - green
        candidate = (red > 155) & (blue > 135) & (keyness > 42)
    elif mode == "green":
        keyness = green - np.maximum(red, blue)
        candidate = (green > 150) & (keyness > 42)
    elif mode == "blue":
        keyness = blue - np.maximum(red, green)
        candidate = (blue > 150) & (keyness > 42)
    else:
        raise ValueError(f"Unsupported key mode: {mode}")

    alpha = np.ones(red.shape, dtype=np.float32)
    alpha[candidate] = np.clip((150 - keyness[candidate]) / 88, 0, 1)
    opaque = alpha >= 0.985
    partial = (alpha > 0.01) & ~opaque

    # Grow unquestioned foreground colors into the narrow antialiased key fringe.
    # This avoids replacing real boss texture with a flat despill color.
    filled = pixels.copy()
    known = opaque.copy()
    height, width = known.shape
    for _ in range(28):
        sums = np.zeros_like(filled)
        counts = np.zeros((height, width), dtype=np.float32)
        for dy, dx in (
            (-1, 0),
            (1, 0),
            (0, -1),
            (0, 1),
            (-1, -1),
            (-1, 1),
            (1, -1),
            (1, 1),
        ):
            source_y = slice(max(0, dy), min(height, height + dy))
            source_x = slice(max(0, dx), min(width, width + dx))
            target_y = slice(max(0, -dy), min(height, height - dy))
            target_x = slice(max(0, -dx), min(width, width - dx))
            mask = known[source_y, source_x]
            sums[target_y, target_x] += filled[source_y, source_x] * mask[..., None]
            counts[target_y, target_x] += mask
        take = ~known & (counts > 0)
        if not take.any():
            break
        filled[take] = sums[take] / counts[take, None]
        known[take] = True

    output = pixels.copy()
    output[partial] = filled[partial]

    # Remove residual magenta/green illumination only when it clearly matches
    # the working key. Royal-blue masters skip this to protect blue plumage.
    if mode == "magenta":
        spill = np.maximum(0, np.minimum(output[..., 0], output[..., 2]) - output[..., 1] - 16)
        active = (alpha > 0.01) & (spill > 0)
        output[..., 1][active] = np.minimum(255, output[..., 1][active] + spill[active] * 0.82)
        output[..., 0][active] = np.maximum(0, output[..., 0][active] - spill[active] * 0.20)
    elif mode == "green":
        spill = np.maximum(0, output[..., 1] - np.maximum(output[..., 0], output[..., 2]) - 16)
        active = (alpha > 0.01) & (spill > 0)
        output[..., 1][active] = np.maximum(0, output[..., 1][active] - spill[active] * 0.86)

    output[alpha <= 0.01] = 0
    return np.dstack(
        [np.clip(output, 0, 255).astype(np.uint8), np.round(alpha * 255).astype(np.uint8)]
    )


def process(master_dir: Path, output_root: Path) -> None:
    expected = EXPEDITION | TRANSCENDENCE
    present = {path.stem for path in master_dir.glob("*.png")}
    missing = sorted(expected - present)
    if missing:
        raise FileNotFoundError(f"Missing chroma masters: {', '.join(missing)}")

    for slug in sorted(expected):
        category = "expedition" if slug in EXPEDITION else "transcendence"
        target_dir = output_root / category / "bosses-v1"
        target_dir.mkdir(parents=True, exist_ok=True)

        source = master_dir / f"{slug}.png"
        png_path = target_dir / f"{slug}.png"
        webp_path = target_dir / f"{slug}.webp"

        if png_path.exists() and webp_path.exists():
            print(f"{category}/{slug}: already processed")
            continue

        rgba = matte(np.array(Image.open(source).convert("RGB")), KEY_MODE[slug])

        image = Image.fromarray(rgba, "RGBA")
        image.save(png_path, optimize=True)
        image.resize((1080, 1080), Image.Resampling.LANCZOS).save(
            webp_path,
            "WEBP",
            quality=94,
            method=6,
            alpha_quality=100,
        )
        print(f"{category}/{slug}: {png_path.stat().st_size} / {webp_path.stat().st_size}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("master_dir", type=Path)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path(__file__).resolve().parent,
    )
    args = parser.parse_args()
    process(args.master_dir.resolve(), args.output_root.resolve())


if __name__ == "__main__":
    main()
