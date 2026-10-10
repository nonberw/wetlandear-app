"""Draw the Telegram bot avatar (640x640 PNG). Telegram crops avatars to a circle, so everything important stays inside the middle 70%.
Needs PyMuPDF: pip install pymupdf. Result: icons/bot-avatar.png (upload it with @BotFather /setuserpic)."""
import os
import pymupdf

SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="640" height="640">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B7BFF"/><stop offset="1" stop-color="#1747D6"/></linearGradient>
  </defs>
  <rect width="640" height="640" fill="#1F5BFF"/>
  <g fill="#FFFFFF">
    <rect x="171" y="262" width="46" height="116" rx="23" opacity=".92"/>
    <rect x="251" y="206" width="46" height="228" rx="23"/>
    <rect x="331" y="150" width="46" height="340" rx="23"/>
    <rect x="411" y="232" width="46" height="176" rx="23" opacity=".92"/>
  </g>
  <g fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" opacity=".55">
    <path d="M205 528 q28 -22 56 0 t56 0 t56 0 t56 0"/>
  </g>
</svg>'''

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons', 'bot-avatar.png')
doc = pymupdf.open(stream=SVG.encode('utf-8'), filetype='svg')
pix = doc[0].get_pixmap(dpi=72, alpha=False)
pix.save(out)
print('saved', out, pix.width, 'x', pix.height)
