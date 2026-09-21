import os
from PIL import Image, ImageDraw, ImageFilter

def create_base_logo(size=1024):
    """Generates the master Cmaster logo at high resolution."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)

    # Vertical gradient background
    for y in range(size):
        factor = y / size
        r = int(24 * (1 - factor) + 9 * factor)
        g = int(24 * (1 - factor) + 9 * factor)
        b = int(27 * (1 - factor) + 11 * factor)
        bg_draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Mask for rounded rectangle
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size, size], radius=int(size * 0.22), fill=255)
    bg.putalpha(mask)

    # Outer border
    border_draw = ImageDraw.Draw(bg)
    inset = int(size * 0.047)
    border_draw.rounded_rectangle(
        [inset, inset, size - inset, size - inset],
        radius=int(size * 0.187),
        outline=(34, 197, 94, 90),
        width=int(size * 0.008)
    )

    # Bézier curve helper
    def bezier(p0, p1, p2, p3, t):
        return (
            (1-t)**3 * p0[0] + 3*(1-t)**2 * t * p1[0] + 3*(1-t) * t**2 * p2[0] + t**3 * p3[0],
            (1-t)**3 * p0[1] + 3*(1-t)**2 * t * p1[1] + 3*(1-t) * t**2 * p2[1] + t**3 * p3[1]
        )

    # 3 Bézier segments defining the stylized 'C'
    scale_factor = size / 512.0
    raw_segments = [
        ((360, 180), (330, 130), (270, 120), (230, 140)),
        ((230, 140), (160, 175), (150, 310), (220, 365)),
        ((220, 365), (270, 400), (340, 375), (365, 335))
    ]

    segments = []
    for seg in raw_segments:
        scaled_seg = tuple((p[0] * scale_factor, p[1] * scale_factor) for p in seg)
        segments.append(scaled_seg)

    pts = []
    for seg in segments:
        for i in range(80):
            pts.append(bezier(*seg, i / 80.0))
    pts.append(segments[-1][3])

    # Glow layer
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_width = int(size * 0.12)
    for i in range(len(pts) - 1):
        factor = i / len(pts)
        r = int(134 * (1 - factor) + 21 * factor)
        g = int(239 * (1 - factor) + 128 * factor)
        b = int(172 * (1 - factor) + 61 * factor)
        glow_draw.line([pts[i], pts[i+1]], fill=(r, g, b, 255), width=glow_width)
    glow = glow.filter(ImageFilter.GaussianBlur(int(size * 0.035)))

    # Sharp C arc
    c_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c_draw = ImageDraw.Draw(c_layer)
    stroke_width = int(size * 0.094)
    for i in range(len(pts) - 1):
        factor = i / len(pts)
        r = int(134 * (1 - factor) + 21 * factor)
        g = int(239 * (1 - factor) + 128 * factor)
        b = int(172 * (1 - factor) + 61 * factor)
        c_draw.line([pts[i], pts[i+1]], fill=(r, g, b, 255), width=stroke_width)

    # Caps
    cap_r = stroke_width / 2.0
    p_start = segments[0][0]
    p_end = segments[-1][3]
    c_draw.ellipse([p_start[0]-cap_r, p_start[1]-cap_r, p_start[0]+cap_r, p_start[1]+cap_r], fill=(134, 239, 172, 255))
    c_draw.ellipse([p_end[0]-cap_r, p_end[1]-cap_r, p_end[0]+cap_r, p_end[1]+cap_r], fill=(34, 197, 94, 255))

    final = Image.alpha_composite(bg, glow)
    final = Image.alpha_composite(final, c_layer)
    return final

def create_round_logo(master_logo):
    size = master_logo.width
    round_img = master_logo.copy()
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([0, 0, size, size], fill=255)
    round_img.putalpha(mask)
    return round_img

def create_adaptive_foreground(size=1024):
    """Creates transparent foreground icon for Android adaptive icons."""
    fg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    master = create_base_logo(int(size * 0.72))
    offset = int((size - master.width) / 2)
    fg.paste(master, (offset, offset), master)
    return fg

def create_splash_screen(width=1080, height=1920):
    """Creates a dark sleek splash screen with centered glowing Cmaster logo."""
    splash = Image.new('RGBA', (width, height), (18, 18, 20, 255))
    logo_size = int(min(width, height) * 0.45)
    logo = create_base_logo(logo_size)
    x = int((width - logo_size) / 2)
    y = int((height - logo_size) / 2)
    splash.paste(logo, (x, y), logo)
    return splash

def main():
    os.makedirs('android_res', exist_ok=True)
    master = create_base_logo(1024)
    round_master = create_round_logo(master)
    adaptive_fg = create_adaptive_foreground(1024)

    # Save root logo
    master.resize((512, 512), Image.Resampling.LANCZOS).save('logo.png', 'PNG')
    master.resize((512, 512), Image.Resampling.LANCZOS).save('public/icon.png', 'PNG')
    print('Generated logo.png and public/icon.png')

    densities = {
        'mipmap-mdpi': (48, 108),
        'mipmap-hdpi': (72, 162),
        'mipmap-xhdpi': (96, 216),
        'mipmap-xxhdpi': (144, 324),
        'mipmap-xxxhdpi': (192, 432),
    }

    for folder, (std_size, fg_size) in densities.items():
        dir_path = os.path.join('android_res', folder)
        os.makedirs(dir_path, exist_ok=True)

        # Standard icon
        icon = master.resize((std_size, std_size), Image.Resampling.LANCZOS)
        icon.save(os.path.join(dir_path, 'ic_launcher.png'), 'PNG')

        # Round icon
        round_icon = round_master.resize((std_size, std_size), Image.Resampling.LANCZOS)
        round_icon.save(os.path.join(dir_path, 'ic_launcher_round.png'), 'PNG')

        # Foreground adaptive icon
        fg_icon = adaptive_fg.resize((fg_size, fg_size), Image.Resampling.LANCZOS)
        fg_icon.save(os.path.join(dir_path, 'ic_launcher_foreground.png'), 'PNG')

        print(f'Generated icons for {folder}')

    # Splash screens
    os.makedirs('android_res/drawable', exist_ok=True)
    os.makedirs('android_res/drawable-port-xxxhdpi', exist_ok=True)
    os.makedirs('android_res/drawable-land-xxxhdpi', exist_ok=True)

    splash_port = create_splash_screen(1080, 1920)
    splash_port.save('android_res/drawable/splash.png', 'PNG')
    splash_port.save('android_res/drawable-port-xxxhdpi/splash.png', 'PNG')

    splash_land = create_splash_screen(1920, 1080)
    splash_land.save('android_res/drawable-land-xxxhdpi/splash.png', 'PNG')
    print('Generated splash screens')

if __name__ == '__main__':
    main()
