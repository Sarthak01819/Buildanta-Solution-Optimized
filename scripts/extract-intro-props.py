#!/usr/bin/env python3
"""Extract Buildanta intro props from the approved 3x3 chroma-key sheets.

The script is deterministic and intentionally does not depend on hand-tuned
crop coordinates. It:

* splits each source sheet from calculated thirds;
* samples the flat magenta from every cell border;
* removes border-connected chroma plus exact enclosed backdrop holes;
* builds a soft alpha matte and reconstructs/despills edge colours;
* trims, pads, centres, and exports alpha-capable WebP cutouts;
* validates all outputs and writes a QA contact sheet/report outside src/.

Install the pinned dependency, then run from the project root:

    python -m pip install -r scripts/requirements-intro-props.txt
    python scripts/extract-intro-props.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = PROJECT_ROOT.parent
DEFAULT_SOURCE_DIR = PROJECT_ROOT / "source-assets" / "prop-sheets"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "src" / "assets" / "intro" / "props"
DEFAULT_QA_DIR = WORKSPACE_ROOT / "outputs" / "qa"


@dataclass(frozen=True)
class Sheet:
    act: str
    filename: str
    names: tuple[str, ...]


SHEETS: tuple[Sheet, ...] = (
    Sheet(
        "idea",
        "01-your-idea-props.png",
        (
            "idea-paper-ball",
            "idea-paper-plane",
            "idea-pencil",
            "idea-sticky-note",
            "idea-notebook-corner",
            "idea-glass-marble",
            "idea-brass-compass",
            "idea-light-spark",
            "idea-coffee-cup",
        ),
    ),
    Sheet(
        "code",
        "02-we-code-props.png",
        (
            "code-keycap-brace",
            "code-keycap-semicolon",
            "code-keycap-slash",
            "code-cursor-bar",
            "code-silicon-chip",
            "code-cable-connector",
            "code-terminal-panel",
            "code-git-branch",
            "code-glass-card-stack",
        ),
    ),
    Sheet(
        "market",
        "03-we-market-props-v2.png",
        (
            "market-bar-chart",
            "market-line-graph",
            "market-pie-segment",
            "market-avatar-card",
            "market-heart-reaction",
            "market-speech-bubble",
            "market-price-tag",
            "market-smartphone-chart",
            "market-shopping-bag",
        ),
    ),
    Sheet(
        "consult",
        "04-we-consult-props.png",
        (
            "consult-clipboard",
            "consult-fountain-pen",
            "consult-spectacles",
            "consult-folded-document",
            "consult-chess-knight",
            "consult-brass-compass",
            "consult-river-stones",
            "consult-coffee-cup",
            "consult-magnifying-glass",
        ),
    ),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def percentile(values: Sequence[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))
    return float(ordered[index])


def border_pixels(image: Image.Image, thickness: int = 4) -> list[tuple[int, int, int]]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    px = rgb.load()
    result: list[tuple[int, int, int]] = []
    edge = max(1, min(thickness, width // 4, height // 4))

    for y in range(edge):
        for x in range(width):
            result.append(px[x, y])
            result.append(px[x, height - 1 - y])
    for x in range(edge):
        for y in range(edge, height - edge):
            result.append(px[x, y])
            result.append(px[width - 1 - x, y])
    return result


def sample_chroma(image: Image.Image) -> tuple[tuple[int, int, int], float]:
    samples = border_pixels(image)
    chroma = tuple(int(round(median(channel))) for channel in zip(*samples))
    distances = [
        math.sqrt(
            (red - chroma[0]) ** 2
            + (green - chroma[1]) ** 2
            + (blue - chroma[2]) ** 2
        )
        for red, green, blue in samples
    ]
    return chroma, percentile(distances, 0.95)


def smoothstep(value: float) -> float:
    value = min(1.0, max(0.0, value))
    return value * value * (3.0 - 2.0 * value)


def build_cutout(cell: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    """Return an RGBA cutout and extraction diagnostics for one grid cell."""

    source = cell.convert("RGB")
    width, height = source.size
    pixels = list(source.get_flattened_data())
    chroma, border_noise = sample_chroma(source)

    # The sheets have a flat, saturated-magenta backdrop. The adaptive core
    # threshold handles tiny encoding noise; the wider soft threshold handles
    # antialiasing without accepting solid plum/coral objects as background.
    core = max(10.0, min(28.0, border_noise * 3.0 + 8.0))
    soft = max(176.0, core + 120.0)
    red_floor = max(0, chroma[0] - 116)
    blue_floor = max(0, chroma[2] - 116)
    green_ceiling = min(255, chroma[1] + 184)

    distances = [
        math.sqrt(
            (red - chroma[0]) ** 2
            + (green - chroma[1]) ** 2
            + (blue - chroma[2]) ** 2
        )
        for red, green, blue in pixels
    ]
    candidates = bytearray(
        int(
            distance <= soft
            and red >= red_floor
            and blue >= blue_floor
            and green <= green_ceiling
        )
        for (red, green, blue), distance in zip(pixels, distances)
    )

    # Start with the physical cell border. Exact-chroma seeds elsewhere clear
    # deliberate enclosed backdrop holes (spectacle lenses, tag holes, etc.)
    # without globally deleting merely pink or purple object pixels.
    visited = bytearray(width * height)
    queue: deque[int] = deque()

    def seed(index: int) -> None:
        if candidates[index] and not visited[index]:
            visited[index] = 1
            queue.append(index)

    for x in range(width):
        seed(x)
        seed((height - 1) * width + x)
    for y in range(height):
        seed(y * width)
        seed(y * width + width - 1)
    for index, distance in enumerate(distances):
        if distance <= core:
            seed(index)

    while queue:
        index = queue.popleft()
        x = index % width
        if index >= width:
            seed(index - width)
        if index < width * (height - 1):
            seed(index + width)
        if x:
            seed(index - 1)
        if x < width - 1:
            seed(index + 1)

    rgba: list[tuple[int, int, int, int]] = []
    partial_count = 0
    transparent_count = 0
    for index, (red, green, blue) in enumerate(pixels):
        if not visited[index]:
            rgba.append((red, green, blue, 255))
            continue

        distance = distances[index]
        if distance <= core:
            rgba.append((0, 0, 0, 0))
            transparent_count += 1
            continue

        alpha_fraction = smoothstep((distance - core) / (soft - core))
        alpha = max(0, min(255, round(alpha_fraction * 255)))
        if alpha <= 1:
            rgba.append((0, 0, 0, 0))
            transparent_count += 1
            continue

        # Reconstruct the foreground colour from its blend over the sampled
        # chroma. This is the despill step and is less destructive to coral,
        # brass, and plum than suppressing red/blue channels globally.
        safe_alpha = max(0.06, alpha / 255.0)
        out_channels = []
        for observed, backdrop in zip((red, green, blue), chroma):
            value = (observed - (1.0 - safe_alpha) * backdrop) / safe_alpha
            out_channels.append(max(0, min(255, round(value))))
        rgba.append((*out_channels, alpha))
        partial_count += 1

    result = Image.new("RGBA", (width, height))
    result.putdata(rgba)
    return result, {
        "sampled_chroma": list(chroma),
        "border_noise_p95": round(border_noise, 3),
        "core_threshold": round(core, 3),
        "soft_threshold": round(soft, 3),
        "background_pixels": transparent_count,
        "soft_edge_pixels": partial_count,
    }


def remove_stray_components(
    image: Image.Image, minimum_fraction: float = 0.025
) -> tuple[Image.Image, dict[str, object]]:
    """Drop tiny disconnected pieces that leaked in from an adjacent grid cell.

    A few generated objects extend a decorative handle a handful of pixels
    across a mathematical grid boundary. Keeping every component would attach
    that neighbour fragment to the current prop. Relative-size filtering keeps
    intentional multi-piece objects (for example all four market bars) while
    removing only components smaller than 2.5% of the dominant object.
    """

    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = list(rgba.get_flattened_data())
    active = [alpha > 0 for _, _, _, alpha in pixels]
    seen = bytearray(width * height)
    components: list[list[int]] = []

    for start, is_active in enumerate(active):
        if not is_active or seen[start]:
            continue
        seen[start] = 1
        queue: deque[int] = deque((start,))
        component: list[int] = []
        while queue:
            index = queue.popleft()
            component.append(index)
            x = index % width
            neighbours = []
            if index >= width:
                neighbours.append(index - width)
            if index < width * (height - 1):
                neighbours.append(index + width)
            if x:
                neighbours.append(index - 1)
            if x < width - 1:
                neighbours.append(index + 1)
            for neighbour in neighbours:
                if active[neighbour] and not seen[neighbour]:
                    seen[neighbour] = 1
                    queue.append(neighbour)
        components.append(component)

    if not components:
        return rgba, {
            "component_count": 0,
            "kept_components": 0,
            "removed_components": 0,
            "removed_pixels": 0,
        }

    dominant = max(components, key=len)
    largest = len(dominant)
    cutoff = max(12, math.ceil(largest * minimum_fraction))

    def touches_cell_boundary(component: Sequence[int]) -> bool:
        for index in component:
            x = index % width
            y = index // width
            if x == 0 or y == 0 or x == width - 1 or y == height - 1:
                return True
        return False

    keep = [
        component
        for component in components
        if component is dominant
        or (
            len(component) >= cutoff
            and not touches_cell_boundary(component)
        )
    ]
    removed = [component for component in components if component not in keep]

    if removed:
        mutable = pixels[:]
        for component in removed:
            for index in component:
                mutable[index] = (0, 0, 0, 0)
        rgba.putdata(mutable)

    return rgba, {
        "component_count": len(components),
        "kept_components": len(keep),
        "removed_components": len(removed),
        "removed_pixels": sum(len(component) for component in removed),
        "largest_component_pixels": largest,
        "minimum_kept_pixels": cutoff,
        "dominant_touched_cell_boundary": touches_cell_boundary(dominant),
        "boundary_fragments_removed": sum(
            1 for component in removed if touches_cell_boundary(component)
        ),
    }


def alpha_bbox(image: Image.Image, threshold: int = 1) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    if threshold > 1:
        alpha = alpha.point(lambda value: 255 if value >= threshold else 0)
    return alpha.getbbox()


def trim_pad_center(
    image: Image.Image, padding_ratio: float, max_size: int
) -> tuple[Image.Image, dict[str, object]]:
    bbox = alpha_bbox(image, 1)
    if bbox is None:
        raise ValueError("extraction produced no visible pixels")

    trimmed = image.crop(bbox)
    object_width, object_height = trimmed.size
    padding = max(4, math.ceil(max(object_width, object_height) * padding_ratio))
    side = max(object_width, object_height) + padding * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    offset = ((side - object_width) // 2, (side - object_height) // 2)
    canvas.alpha_composite(trimmed, offset)

    before_resize = canvas.size
    if side > max_size:
        canvas.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

    return canvas, {
        "source_alpha_bbox": list(bbox),
        "trimmed_size": [object_width, object_height],
        "padding_px": padding,
        "square_before_resize": list(before_resize),
        "output_size": list(canvas.size),
    }


def largest_component(mask: Sequence[bool], width: int, height: int) -> int:
    seen = bytearray(width * height)
    largest = 0
    for start, active in enumerate(mask):
        if not active or seen[start]:
            continue
        seen[start] = 1
        queue: deque[int] = deque((start,))
        size = 0
        while queue:
            index = queue.popleft()
            size += 1
            x = index % width
            neighbours = []
            if index >= width:
                neighbours.append(index - width)
            if index < width * (height - 1):
                neighbours.append(index + width)
            if x:
                neighbours.append(index - 1)
            if x < width - 1:
                neighbours.append(index + 1)
            for neighbour in neighbours:
                if mask[neighbour] and not seen[neighbour]:
                    seen[neighbour] = 1
                    queue.append(neighbour)
        largest = max(largest, size)
    return largest


def validate_cutout(image: Image.Image) -> dict[str, object]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = list(rgba.get_flattened_data())
    alphas = [alpha for _, _, _, alpha in pixels]
    visible_mask = [alpha >= 16 for alpha in alphas]
    opaque_mask = [alpha >= 96 for alpha in alphas]
    visible_count = sum(visible_mask)
    opaque_count = sum(opaque_mask)
    coverage = visible_count / (width * height)
    bbox = alpha_bbox(rgba, 16)

    if bbox:
        left, top, right, bottom = bbox
        margins = [left, top, width - right, height - bottom]
    else:
        margins = [0, 0, 0, 0]

    largest = largest_component(opaque_mask, width, height) if opaque_count else 0
    fringe_count = sum(
        1
        for red, green, blue, alpha in pixels
        if alpha >= 16 and red >= 205 and blue >= 205 and green <= 92
    )
    fringe_ratio = fringe_count / max(1, visible_count)
    corners = [
        rgba.getpixel((0, 0))[3],
        rgba.getpixel((width - 1, 0))[3],
        rgba.getpixel((0, height - 1))[3],
        rgba.getpixel((width - 1, height - 1))[3],
    ]

    checks = {
        "rgba": rgba.mode == "RGBA",
        "square_max_512": width == height and width <= 512,
        "transparent_corners": all(alpha == 0 for alpha in corners),
        "visible_coverage": 0.004 <= coverage <= 0.82,
        "boundary_clear": bbox is not None and min(margins) >= 2,
        "largest_component_present": largest >= max(16, round(opaque_count * 0.015)),
        "magenta_fringe": fringe_ratio <= 0.005,
    }
    return {
        "checks": checks,
        "passed": all(checks.values()),
        "dimensions": [width, height],
        "corner_alpha": corners,
        "visible_pixels": visible_count,
        "opaque_pixels": opaque_count,
        "visible_coverage": round(coverage, 6),
        "visible_bbox": list(bbox) if bbox else None,
        "margins_px": margins,
        "largest_opaque_component": largest,
        "largest_component_fraction": round(largest / max(1, opaque_count), 6),
        "magenta_fringe_pixels": fringe_count,
        "magenta_fringe_ratio": round(fringe_ratio, 8),
    }


def make_checkerboard(size: tuple[int, int], cell: int = 12) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size, (31, 34, 42))
    draw = ImageDraw.Draw(image)
    colours = ((31, 34, 42), (51, 55, 66))
    for y in range(0, height, cell):
        for x in range(0, width, cell):
            draw.rectangle(
                (x, y, min(width, x + cell - 1), min(height, y + cell - 1)),
                fill=colours[(x // cell + y // cell) % 2],
            )
    return image


def load_qa_font(size: int) -> ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def make_contact_sheet(
    records: Sequence[dict[str, object]], output_path: Path
) -> None:
    columns = 9
    tile_width = 184
    tile_height = 214
    image_box = 166
    rows = math.ceil(len(records) / columns)
    contact = Image.new(
        "RGB", (columns * tile_width, rows * tile_height), (18, 20, 25)
    )
    font = load_qa_font(12)
    small_font = load_qa_font(10)
    draw = ImageDraw.Draw(contact)

    for index, record in enumerate(records):
        column = index % columns
        row = index // columns
        x = column * tile_width
        y = row * tile_height
        checker = make_checkerboard((image_box, image_box))
        cutout = Image.open(record["output"]).convert("RGBA")
        preview = ImageOps.contain(
            cutout, (image_box - 14, image_box - 14), Image.Resampling.LANCZOS
        )
        paste_at = (
            (image_box - preview.width) // 2,
            (image_box - preview.height) // 2,
        )
        checker.paste(preview, paste_at, preview)
        contact.paste(checker, (x + 9, y + 8))

        name = str(record["name"])
        label = name if len(name) <= 26 else name[:25] + "..."
        draw.text((x + 9, y + 178), label, fill=(236, 239, 246), font=font)
        status = "PASS" if record["validation"]["passed"] else "FAIL"
        coverage = record["validation"]["visible_coverage"]
        draw.text(
            (x + 9, y + 195),
            f"{status}  coverage {coverage:.1%}",
            fill=(126, 231, 181) if status == "PASS" else (255, 123, 123),
            font=small_font,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    contact.save(output_path, "WEBP", quality=90, method=6)


def split_cell(sheet: Image.Image, index: int) -> Image.Image:
    row, column = divmod(index, 3)
    width, height = sheet.size
    left = column * width // 3
    right = (column + 1) * width // 3
    top = row * height // 3
    bottom = (row + 1) * height // 3
    return sheet.crop((left, top, right, bottom))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--qa-dir", type=Path, default=DEFAULT_QA_DIR)
    parser.add_argument("--max-size", type=int, default=512)
    parser.add_argument("--padding-ratio", type=float, default=0.10)
    parser.add_argument("--quality", type=int, default=92)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not 64 <= args.max_size <= 2048:
        raise SystemExit("--max-size must be between 64 and 2048")
    if not 0.08 <= args.padding_ratio <= 0.12:
        raise SystemExit("--padding-ratio must be between 0.08 and 0.12")
    if not 1 <= args.quality <= 100:
        raise SystemExit("--quality must be between 1 and 100")

    records: list[dict[str, object]] = []
    source_records: list[dict[str, object]] = []

    for sheet_spec in SHEETS:
        source_path = args.source_dir / sheet_spec.filename
        if not source_path.is_file():
            raise FileNotFoundError(f"Missing source sheet: {source_path}")

        sheet = Image.open(source_path).convert("RGB")
        if sheet.width != sheet.height:
            raise ValueError(f"Source sheet must be square: {source_path}")
        source_records.append(
            {
                "act": sheet_spec.act,
                "path": str(source_path.resolve()),
                "dimensions": list(sheet.size),
                "sha256": sha256(source_path),
            }
        )
        act_output = args.output_dir / sheet_spec.act
        act_output.mkdir(parents=True, exist_ok=True)

        for index, name in enumerate(sheet_spec.names):
            cell = split_cell(sheet, index)
            keyed, extraction = build_cutout(cell)
            keyed, component_cleanup = remove_stray_components(keyed)
            extraction["component_cleanup"] = component_cleanup
            finished, geometry = trim_pad_center(
                keyed, args.padding_ratio, args.max_size
            )
            output_path = act_output / f"{name}.webp"
            finished.save(
                output_path,
                "WEBP",
                quality=args.quality,
                method=6,
                exact=True,
            )

            # Validate the encoded file, not merely the pre-save Pillow image.
            encoded = Image.open(output_path).convert("RGBA")
            validation = validate_cutout(encoded)
            record = {
                "act": sheet_spec.act,
                "index": index + 1,
                "name": name,
                "source": str(source_path.resolve()),
                "cell": list(cell.size),
                "output": str(output_path.resolve()),
                "bytes": output_path.stat().st_size,
                "sha256": sha256(output_path),
                "extraction": extraction,
                "geometry": geometry,
                "validation": validation,
            }
            records.append(record)
            state = "PASS" if validation["passed"] else "FAIL"
            print(
                f"[{state}] {sheet_spec.act}/{name}.webp "
                f"{encoded.width}x{encoded.height} "
                f"{output_path.stat().st_size:,} bytes"
            )

    contact_path = args.qa_dir / "intro-props-contact-sheet.webp"
    report_path = args.qa_dir / "intro-props-validation.json"
    make_contact_sheet(records, contact_path)

    failed = [
        {
            "name": record["name"],
            "checks": record["validation"]["checks"],
        }
        for record in records
        if not record["validation"]["passed"]
    ]
    report = {
        "script": str(Path(__file__).resolve()),
        "settings": {
            "max_size": args.max_size,
            "padding_ratio": args.padding_ratio,
            "webp_quality": args.quality,
            "webp_method": 6,
        },
        "sources": source_records,
        "output_directory": str(args.output_dir.resolve()),
        "asset_count": len(records),
        "total_bytes": sum(int(record["bytes"]) for record in records),
        "passed": not failed and len(records) == 36,
        "failed": failed,
        "contact_sheet": str(contact_path.resolve()),
        "assets": records,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"\nQA contact sheet: {contact_path.resolve()}")
    print(f"Validation report: {report_path.resolve()}")
    print(
        f"Assets: {len(records)} | "
        f"Total: {report['total_bytes']:,} bytes | "
        f"Status: {'PASS' if report['passed'] else 'FAIL'}"
    )
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
