# మీ ₹ లోగోను యాప్ ఐకాన్‌గా మారుస్తుంది (లోగో డేటా logo_data.txt లో ఉంది)
import base64
import hashlib
import io

from PIL import Image, ImageFilter

EXPECTED = "ca254cea53e3396cb5e674d7e921ee3b7244a3a0df586ecc5a83998782a7d160"

body = None
try:
    raw = open("logo_data.txt", encoding="utf-8").read()
    data = base64.b64decode("".join(raw.split()))
    if hashlib.sha256(data).hexdigest() == EXPECTED:
        body = Image.open(io.BytesIO(data)).convert("RGB")
    else:
        print("WARNING: logo_data.txt is damaged or incomplete - using a plain icon")
except Exception as e:
    print("WARNING: could not read logo_data.txt - using a plain icon", e)

if body is None:
    body = Image.new("RGB", (256, 256), (75, 63, 224))

icon = body.resize((1024, 1024), Image.LANCZOS)
icon.save("icon.png")

# Android అడాప్టివ్ ఐకాన్: చుట్టూ అదే చీకటి రంగు, మధ్యలో లోగో (అంచులు మెల్లగా కలుస్తాయి)
thumb = body.resize((32, 32), Image.LANCZOS)
ring = []
for i in range(32):
    ring.append(thumb.getpixel((i, 0)))
    ring.append(thumb.getpixel((i, 31)))
    ring.append(thumb.getpixel((0, i)))
    ring.append(thumb.getpixel((31, i)))
fill = tuple(sum(p[k] for p in ring) // len(ring) for k in range(3))

canvas = Image.new("RGBA", (1024, 1024), fill + (255,))
art = body.resize((700, 700), Image.LANCZOS).convert("RGBA")
mask = Image.new("L", (700, 700), 0)
mask.paste(255, (36, 36, 664, 664))
mask = mask.filter(ImageFilter.GaussianBlur(18))
canvas.paste(art, (162, 162), mask)
canvas.save("adaptive-icon.png")
print("logo ready")
