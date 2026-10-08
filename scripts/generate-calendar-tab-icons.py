"""Generate local calendar-day PNG masks. Development tool; Pillow is not an app dependency."""
import argparse
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def calendar_icon(day, font_path):
    factor = 12
    image = Image.new("RGBA", (28 * factor, 28 * factor))
    draw = ImageDraw.Draw(image)
    white = (255, 255, 255, 255)
    stroke = round(1.6 * factor)
    draw.rounded_rectangle(
        tuple(round(v * factor) for v in (3.5, 5.5, 24.5, 25.5)),
        radius=round(2.1 * factor), outline=white, width=stroke,
    )
    for x in (9, 19):
        draw.line((x * factor, 2.5 * factor, x * factor, 7 * factor), fill=white, width=stroke)
        draw.ellipse(((x - 0.8) * factor, 1.7 * factor, (x + 0.8) * factor, 3.3 * factor), fill=white)
    draw.line((4.2 * factor, 10 * factor, 23.8 * factor, 10 * factor), fill=white, width=stroke)
    font = ImageFont.truetype(str(font_path), round(13.5 * factor))
    draw.text((14 * factor, 17.9 * factor), str(day), font=font, fill=white, anchor="mm")
    return image.resize((84, 84), Image.Resampling.LANCZOS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", type=Path, default=Path("C:/Windows/Fonts/seguisb.ttf"))
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    images = [calendar_icon(day, args.font) for day in range(1, 32)]
    encoded = []
    for image in images:
        buffer = io.BytesIO()
        image.save(buffer, "PNG", optimize=True)
        encoded.append(base64.b64encode(buffer.getvalue()).decode("ascii"))
    target = root / "src/navigation/calendar-tab-icons.json"
    target.write_text(json.dumps(encoded, indent=2) + "\n", encoding="utf-8")
    if args.preview:
        sheet = Image.new("RGB", (420, 168), "#f2f2f7")
        for index, day in enumerate((1, 8, 11, 28, 31)):
            mask = images[day - 1].getchannel("A")
            sheet.paste(Image.new("RGB", (84, 84), "#007aff"), (index * 84, 0), mask)
            sheet.paste(Image.new("RGB", (84, 84), "#000000"), (index * 84, 84))
            sheet.paste(Image.new("RGB", (84, 84), "#ffeb3b"), (index * 84, 84), mask)
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(args.preview)
    print(f"Generated 31 local PNG masks: {target.name}, {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
