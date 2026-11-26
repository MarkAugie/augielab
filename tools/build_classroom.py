#!/usr/bin/env python3
"""Rebuild gps/classroom.html from gps/index.html.

The classroom edition is one self-contained file that works offline:
no web fonts, no visitor counter, the "What's happening?" script built in,
no outside requests, the MIT License at the bottom, and the "My phone (live)"
mode pointing to the website (browsers won't share location with a downloaded file).

Run from the repo root after changing gps/index.html:
    python3 tools/build_classroom.py
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / 'gps/index.html').read_text(encoding='utf-8')
explain = (ROOT / 'lab/explain.js').read_text(encoding='utf-8').strip()
lic = (ROOT / 'LICENSE').read_text(encoding='utf-8').strip()
s = src

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        sys.exit(f'build_classroom: expected {count} of {old[:70]!r}, found {n}. Update this script to match gps/index.html.')
    s = s.replace(old, new)

def sub(pattern, new, flags=0):
    global s
    s2, n = re.subn(pattern, new, s, flags=flags)
    if not n:
        sys.exit(f'build_classroom: pattern not found: {pattern[:70]!r}')
    s = s2

# No outside requests: web fonts and social-preview tags go.
sub(r'<link rel="preconnect"[^\n]*\n', '')
sub(r'<link href="https://fonts.googleapis.com[^\n]*\n', '')
sub(r'<meta property="og:[^\n]*\n', '')
sub(r'<link rel="(?:icon|apple-touch-icon)"[^\n]*\n', '')
sub(r'<title>[^<]*</title>', '<title>Where Am I, Really? GPS Accuracy (Classroom Edition)</title>')
rep('<nav class="top"><a href="/">← AugieLab</a></nav>',
    '<nav class="top"><span style="color:var(--dim);font-weight:600">Classroom edition · works offline</span></nav>')

# Footer: credit and license instead of the random-source line and the download link.
sub(r'<div class="source" id="source">.*?</div>\n\s*<p style="margin-top:12px;text-align:center[^\n]*</p>',
    '''<div class="source" id="source"><i></i><span id="sourceText">Random errors: from your browser's generator.</span></div>
  <p class="credit">Classroom edition of <a href="https://augielab.dev/gps/">augielab.dev/gps</a> by Mark Aughenbaugh. This one file works offline and sends nothing anywhere.
  Free to use, copy and change under the MIT License (see the bottom of this file). Code: <a href="https://github.com/MarkAugie/augielab">github.com/MarkAugie/augielab</a></p>''', re.S)
rep('  .source.quantum i', '  .credit { margin: 14px auto 0; max-width: 70ch; text-align: center; font-size: .85rem; color: var(--soft); }\n  .credit a { color: var(--dim); }\n  .source.quantum i')

# Random source: always the browser's generator; no counter.
rep("const SOURCE = { ENDPOINT: '', NAME: 'Crypta Labs Cicada quantum generator' };",
    "const SOURCE = { ENDPOINT: '', NAME: '' };          // classroom edition: always the browser's generator")
sub(r"\$\('sourceText'\)\.textContent = q \?.*?;\n", "$('sourceText').textContent = \"Random errors: from your browser's generator.\";\n", re.S)
rep("window.labTrack && labTrack('fix', sinceTrack); ", '')

# My phone (live): send people to the website instead.
rep('<button class="btn primary" id="liveStart">Start using my location</button>',
    '<a class="btn primary" id="liveStart" href="https://augielab.dev/gps/" style="display:inline-block;text-decoration:none">Open the website version</a>')
rep("  function liveStart() {", "  function liveStart() {\n    if (CLASSROOM) return;")
rep("  const LIVE = {", "  const CLASSROOM = true;   // offline copy: browsers only share location with real websites\n  const LIVE = {")
rep("Your location stays on your device. This page never sends or saves it.' : LIVE.acc",
    "This offline copy can\\'t read your location: browsers only share it with real websites. With internet, tap below to use <b>augielab.dev/gps</b>.' : LIVE.acc")
rep("Your location stays on your device. This page never sends or saves it.</span><br>",
    "This offline copy can't read your location: browsers only share it with real websites. With internet, tap below to use <b>augielab.dev/gps</b>.</span><br>")
sub(r"if \(LIVE\.watch === null\) \{ v\.innerHTML = '[^']*'; return; \}",
    "if (LIVE.watch === null) { v.innerHTML = 'Using your real location needs the website version, <b>augielab.dev/gps</b>, because browsers won\\'t share location with a downloaded file.'; return; }")
rep("$('liveStart').textContent = LIVE.watch !== null ? 'Start over' : 'Start using my location'; ", "")

# Explainer: the randomness section, plus an "About this page" section.
sub(r"<h3>Where the randomness comes from</h3>\s*<p>.*?</p>",
    "<h3>Where the randomness comes from</h3>\n  <p>Real GPS errors come from the atmosphere and electronics. Here, the random parts of every simulated error come from your browser's random number generator. The original page on augielab.dev can use a quantum random number generator instead.</p>\n  <h3>About this page</h3>\n  <p>Made by Mark Aughenbaugh for AugieLab. Numbers come from GPS.gov (phones, 4.9 m), typical survey-receiver RTK specs (8 mm + 1 ppm), the Galileo High Accuracy Service target (20 cm, 95%), and GPS World's \"Inside the Box\" column on GPS and relativity. It's a teaching simulation, not real receiver data.</p>", re.S)

# Built-in explainer script; no tracker.
rep('<script src="/lab/explain.js" defer></script>\n<script src="/lab/track.js" defer></script>\n', '<script>\n' + explain + '\n</script>\n')

# License at the bottom.
rep('</html>', '<!--\n' + lic + '\n-->\n</html>')

for bad in ('googleapis', '/lab/', 'track.js'):
    if bad in s:
        sys.exit(f'build_classroom: {bad!r} still in the output')
(ROOT / 'gps/classroom.html').write_text(s, encoding='utf-8')
print(f'Wrote gps/classroom.html ({len(s):,} bytes)')
