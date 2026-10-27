# యాప్ లోగో (icon.png, adaptive-icon.png) తయారు చేసే స్క్రిప్ట్ - బిల్డ్ సమయంలో ఆటోమేటిక్‌గా నడుస్తుంది
import struct
import zlib

SIZE = 1024


def rrect_cov(x, y, x0, y0, x1, y1, r):
    # గుండ్రని చతురస్రం లోపల ఉందా (0..1)
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 - r
    c = 0.5 - d
    return 0.0 if c < 0 else (1.0 if c > 1 else c)


def blend(buf, i, rgb, a):
    if a <= 0:
        return
    da = buf[i + 3] / 255.0
    oa = a + da * (1 - a)
    if oa <= 0:
        return
    for k in range(3):
        buf[i + k] = int((rgb[k] * a + buf[i + k] * da * (1 - a)) / oa + 0.5)
    buf[i + 3] = int(oa * 255 + 0.5)


def fill_rrect(buf, x0, y0, x1, y1, r, rgb, hole=None):
    for y in range(int(y0) - 1, int(y1) + 2):
        for x in range(int(x0) - 1, int(x1) + 2):
            if x < 0 or y < 0 or x >= SIZE or y >= SIZE:
                continue
            px, py = x + 0.5, y + 0.5
            a = rrect_cov(px, py, x0, y0, x1, y1, r)
            if a > 0 and hole:
                a *= 1 - rrect_cov(px, py, *hole)
            if a > 0:
                blend(buf, (y * SIZE + x) * 4, rgb, a)


def fill_circle(buf, cx, cy, rad, rgb):
    fill_rrect(buf, cx - rad, cy - rad, cx + rad, cy + rad, rad, rgb)


def draw_art(buf):
    WHITE = (255, 255, 255)
    ORANGE = (255, 159, 28)
    start = 212.0
    total = 600.0
    n = 9
    cell = total / n
    # మూడు మూలల్లో QR చతురస్రాలు
    for (cx_, cy_) in [(0, 0), (6, 0), (0, 6)]:
        x0 = start + cx_ * cell
        y0 = start + cy_ * cell
        x1 = x0 + 3 * cell
        y1 = y0 + 3 * cell
        pad = cell * 0.6
        fill_rrect(buf, x0, y0, x1, y1, 34, WHITE,
                   hole=(x0 + pad, y0 + pad, x1 - pad, y1 - pad, 14))
        mid = cell * 1.0
        fill_rrect(buf, x0 + mid, y0 + mid, x1 - mid, y1 - mid, 12, WHITE)
    # మధ్యలో చుక్కలు
    grid = [
        [0, 0, 0, 1, 0, 1, 0, 0, 0],
        [0, 0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0, 0],
        [1, 0, 1, 1, 0, 1, 1, 0, 1],
        [0, 1, 1, 0, 1, 0, 0, 1, 1],
        [1, 1, 0, 1, 1, 1, 0, 1, 0],
        [0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 1, 0, 1, 0, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0, 0],
    ]
    for gy in range(n):
        for gx in range(n):
            if not grid[gy][gx]:
                continue
            x0 = start + gx * cell + cell * 0.12
            y0 = start + gy * cell + cell * 0.12
            s = cell * 0.76
            fill_rrect(buf, x0, y0, x0 + s, y0 + s, 10, WHITE)
    # కింద కుడివైపు నారింజ రంగు చతురస్రం (చెల్లింపు గుర్తు)
    x0 = start + 6 * cell
    y0 = start + 6 * cell
    fill_rrect(buf, x0, y0, x0 + 3 * cell, y0 + 3 * cell, 34, ORANGE)
    fill_circle(buf, x0 + 1.5 * cell, y0 + 1.5 * cell, cell * 0.8, (255, 255, 255))
    fill_circle(buf, x0 + 1.5 * cell, y0 + 1.5 * cell, cell * 0.5, ORANGE)


def write_png(path, buf):
    raw = bytearray()
    stride = SIZE * 4
    for y in range(SIZE):
        raw.append(0)
        raw.extend(buf[y * stride:(y + 1) * stride])
    comp = zlib.compress(bytes(raw), 6)

    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', comp)
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def main():
    # 1) ముందు వైపు (పూర్తి రంగు నేపథ్యం)
    icon = bytearray(SIZE * SIZE * 4)
    c0 = (110, 78, 245)
    c1 = (63, 52, 209)
    for y in range(SIZE):
        for x in range(SIZE):
            t = (x + y) / (2.0 * (SIZE - 1))
            i = (y * SIZE + x) * 4
            icon[i] = int(c0[0] + (c1[0] - c0[0]) * t)
            icon[i + 1] = int(c0[1] + (c1[1] - c0[1]) * t)
            icon[i + 2] = int(c0[2] + (c1[2] - c0[2]) * t)
            icon[i + 3] = 255
    draw_art(icon)
    write_png('icon.png', icon)

    # 2) Android అడాప్టివ్ ఐకాన్ (పారదర్శక నేపథ్యం)
    fg = bytearray(SIZE * SIZE * 4)
    draw_art(fg)
    write_png('adaptive-icon.png', fg)
    print('icon.png, adaptive-icon.png తయారయ్యాయి')


main()
