"""Renders the Spency film: 1920x1080, 30 fps, from app screenshots, with captions, piped to ffmpeg."""
import math, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np

W, H, FPS = 1920, 1080, 30
S = "shots/"
BG = (10, 11, 13)
FG = (236, 238, 242)
MUTED = (138, 145, 155)
ACCENT = (150, 186, 244)
LINE = (38, 42, 49)
FONT = "/usr/share/fonts/opentype/inter/"
f_head = ImageFont.truetype(FONT + "InterDisplay-Medium.otf", 76)
f_kick = ImageFont.truetype(FONT + "Inter-Medium.otf", 26)
f_cap = ImageFont.truetype(FONT + "Inter-Regular.otf", 33)
f_word = ImageFont.truetype(FONT + "InterDisplay-SemiBold.otf", 128)
f_tag = ImageFont.truetype(FONT + "InterDisplay-Regular.otf", 46)
f_small = ImageFont.truetype(FONT + "Inter-Regular.otf", 28)

def ease(x): x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3
def clamp(x): return max(0.0, min(1.0, x))

# ---------- background ----------
yy, xx = np.mgrid[0:H, 0:W]
glow = np.exp(-(((xx - 1500) / 900) ** 2 + ((yy - 120) / 620) ** 2))
glow2 = np.exp(-(((xx - 200) / 800) ** 2 + ((yy - 1100) / 500) ** 2))
bg = np.zeros((H, W, 3))
for c in range(3):
    bg[..., c] = BG[c] + glow * (ACCENT[c] - BG[c]) * 0.10 + glow2 * ((122, 210, 170)[c] - BG[c]) * 0.04
vign = 1 - 0.35 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.75)) ** 2)
bg *= vign[..., None]
BGIMG = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert("RGBA")

# ---------- device cards ----------
def card(path, height, radius, crop=None, pad=90):
    im = Image.open(path).convert("RGB")
    if crop: im = im.crop(crop)
    w = round(im.width * height / im.height)
    im = im.resize((w, height), Image.LANCZOS)
    out = Image.new("RGBA", (w + 2 * pad, height + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("L", out.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((pad, pad + 28, pad + w, pad + height + 28), radius, fill=170)
    sh = sh.filter(ImageFilter.GaussianBlur(34))
    out.paste((0, 0, 0, 255), (0, 0), sh)
    mask = Image.new("L", (w, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, height - 1), radius, fill=255)
    out.paste(im, (pad, pad), mask)
    ImageDraw.Draw(out).rounded_rectangle((pad, pad, pad + w - 1, pad + height - 1), radius, outline=LINE + (255,), width=3)
    return out

PH = 790
CY = 468  # devices sit above the caption band
def phone(name, crop=None): return card(S + name + ".png", PH, 52, crop)

def place(canvas, c, cx, cy, scale=1.0, alpha=1.0, dy=0.0):
    if alpha <= 0: return
    if abs(scale - 1) > 1e-3:
        c = c.resize((round(c.width * scale), round(c.height * scale)), Image.BILINEAR)
    if alpha < 1:
        a = c.getchannel("A").point(lambda v: int(v * alpha)); c = c.copy(); c.putalpha(a)
    canvas.alpha_composite(c, (round(cx - c.width / 2), round(cy - c.height / 2 + dy)))

# ---------- text ----------
def text_layer(kicker, headline):
    img = Image.new("RGBA", (760, 420), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.text((0, 0), kicker.upper(), font=f_kick, fill=ACCENT + (255,))
    y = 52
    for line in headline.split("\n"):
        d.text((0, y), line, font=f_head, fill=FG + (255,)); y += 92
    return img

def fade_img(img, a):
    if a >= 1: return img
    out = img.copy(); out.putalpha(img.getchannel("A").point(lambda v: int(v * a))); return out

CAPS = {}
def caption_img(text):
    if text in CAPS: return CAPS[text]
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        t = (cur + " " + w_).strip()
        if f_cap.getlength(t) > 1240 and cur: lines.append(cur); cur = w_
        else: cur = t
    lines.append(cur)
    lw = max(f_cap.getlength(l) for l in lines); lh = 46
    img = Image.new("RGBA", (int(lw) + 56, lh * len(lines) + 30), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, img.width - 1, img.height - 1), 18, fill=(0, 0, 0, 165))
    for i, l in enumerate(lines):
        d.text(((img.width - f_cap.getlength(l)) / 2, 13 + i * lh), l, font=f_cap, fill=(245, 246, 248, 255))
    CAPS[text] = img; return img

# ---------- scenes ----------
class Scene:
    def __init__(self, start, end, caption=None): self.start, self.end, self.caption = start, end, caption

def headline_scene(kicker, headline):
    layer = text_layer(kicker, headline)
    def draw(c, t):
        a = ease(t / 0.9); c.alpha_composite(fade_img(layer, a), (150, round(CY - 150 + 40 * (1 - a))))
    return draw

def phone_scene(kicker, headline, cards, cx=1360):
    head = headline_scene(kicker, headline)
    def draw(c, t, dur):
        head(c, t)
        p = t / dur
        place(c, cards, cx, CY, scale=0.97 + 0.04 * p, alpha=ease(t / 0.7), dy=40 * (1 - ease(t / 0.9)))
    return draw

def title_scene(c, t, dur):
    # The brand ring fills to three quarters ("on track"), then the name and promise appear.
    k = 2
    size = 220
    ring = Image.new("RGBA", (size * k, size * k), (0, 0, 0, 0)); d = ImageDraw.Draw(ring)
    box = (30 * k, 30 * k, (size - 30) * k, (size - 30) * k)
    d.ellipse(box, outline=LINE + (255,), width=26 * k)
    prog = ease(t / 1.6) * 0.75
    if prog > 0: d.arc(box, -90, -90 + 360 * prog, fill=ACCENT + (255,), width=26 * k)
    ring = ring.resize((size, size), Image.LANCZOS)
    a = ease(t / 0.6)
    group = 180 + 24 + f_word.getlength("spency")  # visible ring + gap + wordmark
    x0 = (W - group) / 2
    c.alpha_composite(fade_img(ring, a), (int(x0 - 20), int(H / 2 - 175)))
    wx = x0 + 180 + 24
    word = Image.new("RGBA", (700, 170), (0, 0, 0, 0)); ImageDraw.Draw(word).text((0, 0), "spency", font=f_word, fill=FG + (255,))
    aw = ease((t - 0.5) / 0.8)
    c.alpha_composite(fade_img(word, aw), (int(wx), int(H / 2 - 158 + 20 * (1 - aw))))
    tag = "End every month on the number you chose."
    tg = Image.new("RGBA", (1300, 70), (0, 0, 0, 0)); ImageDraw.Draw(tg).text(((1300 - f_tag.getlength(tag)) / 2, 0), tag, font=f_tag, fill=MUTED + (255,))
    at = ease((t - 1.6) / 0.9)
    c.alpha_composite(fade_img(tg, at), (int(W / 2 - 650), int(H / 2 + 110 + 16 * (1 - at))))

def end_scene(c, t, dur):
    size = 150; k = 2
    ring = Image.new("RGBA", (size * k, size * k), (0, 0, 0, 0)); d = ImageDraw.Draw(ring)
    box = (20 * k, 20 * k, (size - 20) * k, (size - 20) * k)
    d.ellipse(box, outline=LINE + (255,), width=18 * k)
    d.arc(box, -90, -90 + 270 + 90 * ease((t - 1.0) / 2.5), fill=ACCENT + (255,), width=18 * k)
    ring = ring.resize((size, size), Image.LANCZOS)
    a = ease(t / 0.8)
    c.alpha_composite(fade_img(ring, a), (int(W / 2 - size / 2), 190))
    lines = ["End every month", "on the number you chose."]
    for i, l in enumerate(lines):
        img = Image.new("RGBA", (1400, 110), (0, 0, 0, 0)); ImageDraw.Draw(img).text(((1400 - f_head.getlength(l)) / 2, 0), l, font=f_head, fill=FG + (255,))
        ai = ease((t - 0.3 - 0.25 * i) / 0.9)
        c.alpha_composite(fade_img(img, ai), (W // 2 - 700, int(400 + i * 96 + 20 * (1 - ai))))
    small = [("Safe to spend today  ·  Weekly envelopes  ·  Claude logs your payments", MUTED),
             ("Free and open source (MIT)  ·  github.com/apurvamukherjee/spency-pocket-wallet", ACCENT)]
    for i, (l, col) in enumerate(small):
        img = Image.new("RGBA", (1600, 50), (0, 0, 0, 0)); ImageDraw.Draw(img).text(((1600 - f_small.getlength(l)) / 2, 0), l, font=f_small, fill=col + (255,))
        ai = ease((t - 1.3 - 0.3 * i) / 0.9)
        c.alpha_composite(fade_img(img, ai), (W // 2 - 800, 660 + i * 54))

# Swipe flipbook cards.
SWIPE = [phone(f"swipe-{i:02d}") for i in range(19)] + [phone("swipe-done")]
inbox_head = headline_scene("Inbox", "Claude logs it.\nYou confirm it.")
def swipe_scene(c, t, dur):
    inbox_head(c, t)
    a = ease(t / 0.7)
    if t < 2.4: i = 0
    elif t < 3.9: i = min(18, int((t - 2.4) / 1.5 * 19))
    else: i = 19
    place(c, SWIPE[i], 1360, CY, scale=0.97 + 0.04 * (t / dur), alpha=a, dy=40 * (1 - ease(t / 0.9)))

def two_phones(kicker, headline, a_name, b_name):
    head = headline_scene(kicker, headline)
    ca = card(S + a_name + ".png", 740, 46); cb = card(S + b_name + ".png", 740, 46)
    def draw(c, t, dur):
        head(c, t)
        p = t / dur
        place(c, ca, 1170, CY + 10, scale=0.97 + 0.03 * p, alpha=ease(t / 0.7), dy=40 * (1 - ease(t / 0.9)))
        place(c, cb, 1590, CY - 10, scale=0.97 + 0.03 * p, alpha=ease((t - 0.5) / 0.7), dy=40 * (1 - ease((t - 0.5) / 0.9)))
    return draw

def desktop_scene():
    head = headline_scene("Everywhere", "Phone or desk.\nDark or light.")
    dark = card(S + "desktop.png", 640, 22, pad=80); light = card(S + "desktop-light.png", 640, 22, pad=80)
    def draw(c, t, dur):
        head(c, t)
        p = t / dur
        sc = 0.98 + 0.03 * p
        place(c, dark, 1270, CY, scale=sc, alpha=ease(t / 0.7), dy=40 * (1 - ease(t / 0.9)))
        place(c, light, 1270, CY, scale=sc, alpha=clamp((t - 3.0) / 0.8))
    return draw

SCENES = [
    (0.0, 5.0, title_scene, None),
    (5.0, 11.0, phone_scene("Every morning", "One number:\nsafe to spend today.", phone("home-mobile")),
     "Spency sets your bills aside, splits the rest into weekly envelopes, and tells you what's safe to spend today."),
    (11.0, 18.5, swipe_scene, "Send Claude a payment screenshot. It lands in your Inbox: swipe right to confirm."),
    (18.5, 24.5, phone_scene("Envelopes", "Overspent?\nIt's covered.", phone("home-full", crop=(0, 2000, 780, 3688))),
     "Go over in one envelope and savings from the others cover it, then flex. Your target comes last."),
    (24.5, 30.0, phone_scene("Bills", "Yearly bills,\nno surprises.", phone("bills-mobile")),
     "Insurance and annual plans are saved for a little each month, so no single month takes the hit."),
    (30.0, 35.5, phone_scene("Money in", "Refunds go\nback home.", phone("money-in-mobile")),
     "Refunds return to the envelope they came from. Extra income: spend it this month, or save it."),
    (35.5, 41.0, phone_scene("Your month", "Months that\nmatch your pay.", phone("payday-mobile")),
     "Run each month from payday to payday, or from the 1st to the last day."),
    (41.0, 47.0, two_phones("Accounts", "Every account.\nOne honest total.", "accounts-mobile", "reconcile-mobile"),
     "Track several bank accounts, then check each one against your bank app in ten seconds."),
    (47.0, 53.5, desktop_scene(), "Any currency, language and time zone. No bank logins, ever: Spency only knows what you or Claude tell it."),
    (53.5, 62.0, end_scene, None),
]
DUR = 62.0
XF = 0.6

def render_scene(idx, t):
    start, end, fn, _ = SCENES[idx]
    c = BGIMG.copy(); fn(c, t - start, end - start); return c

def frame(t):
    idx = max(i for i, s in enumerate(SCENES) if s[0] <= t)
    c = render_scene(idx, t)
    if idx > 0 and t - SCENES[idx][0] < XF:
        prev = render_scene(idx - 1, t)
        c = Image.blend(prev, c, ease((t - SCENES[idx][0]) / XF))
    # Caption for the current scene.
    start, end, _, cap = SCENES[idx]
    if cap:
        a = clamp((t - start - 0.5) / 0.3) * clamp((end - 0.35 - t) / 0.3)
        if a > 0:
            ci = caption_img(cap); c.alpha_composite(fade_img(ci, a), (int((W - ci.width) / 2), H - 70 - ci.height))
    return c.convert("RGB")

def srt():
    def ts(x):
        ms = int(round(x * 1000)); return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    out, n = [], 0
    for start, end, _, cap in SCENES:
        if cap:
            n += 1; out.append(f"{n}\n{ts(start + 0.5)} --> {ts(end - 0.35)}\n{cap}\n")
    open("spency-film.srt", "w").write("\n".join(out))

if __name__ == "__main__":
    srt()
    if len(sys.argv) > 1 and sys.argv[1] == "stills":
        for t in [2.5, 8, 14, 16.5, 21, 27, 33, 38, 44, 50, 52, 58]:
            frame(t).save(f"still-{t:05.1f}.png")
        sys.exit()
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", "soundtrack.wav", "-i", "spency-film.srt",
           "-map", "0:v", "-map", "1:a", "-map", "2:s",
           "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-tune", "stillimage",
           "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
           "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-metadata:s:s:0", "title=English",
           "-disposition:s:0", "0", "-metadata", "title=Spency: end every month on the number you chose",
           "-movflags", "+faststart", "-t", str(DUR), "spency-film.mp4"]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = int(DUR * FPS)
    for i in range(total):
        p.stdin.write(frame(i / FPS).tobytes())
        if i % 150 == 0: print(f"{i}/{total}", flush=True)
    p.stdin.close(); p.wait(); print("done", p.returncode)
