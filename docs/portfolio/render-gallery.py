"""Build presentation GIFs from existing captures; no mod execution or model calls.

Run with Python, Pillow and the existing FFmpeg executable on PATH. No dependencies
are installed. Source captures are never overwritten. The font directory can be
overridden for another machine: --font-dir /path/to/fonts --font-file font.ttf.
"""
import argparse
from pathlib import Path
import shutil
import subprocess
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font-dir', default='C:/Windows/Fonts')
    parser.add_argument('--font-file', default='consola.ttf')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    font_dir = Path(args.font_dir).resolve()
    if not (font_dir / args.font_file).is_file():
        raise SystemExit('Provide an existing font with --font-dir and --font-file.')
    if any(c in args.font_file for c in ":'\\/[];,="):
        raise SystemExit('--font-file must be a plain filename without filter syntax.')
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('FFmpeg is required; this script does not install it.')
    output = root / 'assets/portfolio'
    output.mkdir(exist_ok=True)

    def text(value, x, y, size=24, color='0xf0edf6'):
        return "drawtext=fontfile='{}':text='{}':x={}:y={}:fontsize={}:fontcolor={}".format(
            args.font_file, value, x, y, size, color)

    def frame(label, title, action):
        return ','.join([
            text(label, 32, 20, 18, '0xb5a6ff'),
            text(title, 32, 50, 30),
            text(action, 32, 96, 20, '0xd5cfe2'),
            text('Edited montage of existing demos - separate sessions', 32, 604, 16, '0xbdb5cb'),
            text('UI mods add no model calls. Agent work uses normal usage.', 32, 632, 16, '0xbdb5cb'),
        ])

    def run(inputs, filters, name):
        command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y']
        for options, path in inputs:
            command.extend(options + ['-i', str(root / path)])
        raw = output / ('.raw-' + name)
        command.extend(['-filter_complex', filters, '-map', '[gif]', '-an',
                        '-loop', '0', str(raw)])
        subprocess.run(command, cwd=str(font_dir), check=True)
        # Lossless frame deduplication before the final GIF encoding. FFmpeg's
        # constant-fps intermediate repeats still frames; keep their total holds.
        frames, durations, previous = [], [], None
        with Image.open(raw) as decoded:
            palette = decoded.copy()
            for number in range(decoded.n_frames):
                decoded.seek(number)
                image = decoded.convert('RGB')
                pixels = image.tobytes()
                duration = decoded.info.get('duration', 100)
                if pixels == previous:
                    durations[-1] += duration
                else:
                    frames.append(image.quantize(palette=palette, dither=Image.NONE))
                    durations.append(duration)
                    previous = pixels
        frames[0].save(output / name, save_all=True, append_images=frames[1:],
                       duration=durations, loop=0, optimize=True, disposal=1)
        raw.unlink()
        print('Created', name, (output / name).stat().st_size, 'bytes')

    # The Switchboard pane and cache band are two crops of the same original
    # frame, with matching timestamps. No UI, text or state is reconstructed.
    montage = ';'.join([
        '[0:v]setpts=PTS-STARTPTS,format=rgba,premultiply=inplace=1,format=rgb24,split[sba][sbb]',
        '[sba]crop=357:190:735:0,scale=714:380:flags=lanczos,pad=880:660:83:146:color=0x111019[sbbase]',
        '[sbb]crop=735:45:0:505[band]',
        '[sbbase][band]overlay=72:544,' + frame('01 / 03   SWITCHBOARD', 'Choose what stays on screen', '/mods  >  Hide panel  >  Show panel') + ',format=rgb24,crop=880:658:0:0,pad=880:660:0:0:color=0x111019[s0]',
        '[1:v]setpts=PTS-STARTPTS,format=rgba,premultiply=inplace=1,format=rgb24,scale=736:420:flags=lanczos,pad=880:660:72:146:color=0x111019,' + frame('02 / 03   REPLAY THEATER', 'Review one edit at a time', '/replay  >  Next  >  Prev') + '[s1]',
        '[2:v]setpts=PTS-STARTPTS,format=rgba,premultiply=inplace=1,format=rgb24,scale=508:395:flags=lanczos,pad=880:660:186:146:color=0x111019,' + frame('03 / 03   HELPER DESK', 'Follow the work to completion', '/helper-desk  >  running  >  finished') + '[s2]',
        '[s0][s1][s2]concat=n=3:v=1:a=0,fps=10,split[colors][pixels]',
        '[colors]palettegen=stats_mode=full:reserve_transparent=0[palette]',
        '[pixels][palette]paletteuse=dither=bayer:bayer_scale=3[gif]',
    ])
    run([(['-ignore_loop', '1'], 'assets/switchboard.gif'),
         (['-ignore_loop', '1'], 'assets/replay-theater.gif'),
         (['-ignore_loop', '1'], 'assets/helper-desk.gif')], montage, 'showcase.gif')

    # A temporal comparison made from the original before/after screenshot.
    # The line-item amounts still visible in the On capture are preserved.
    stages = []
    for i, left in enumerate([30, 600]):
        label = 'OFF - original example' if i == 0 else 'ON - matching text masked'
        stages.append('[{}:v]setpts=PTS-STARTPTS,format=rgba,premultiply=inplace=1,format=rgb24,crop=550:334:{}:30,pad=600:500:25:90:color=0x111019,{}[s{}]'.format(
            i, left, ','.join([
                text('SCREEN-SHARE', 25, 15, 16, '0xb5a6ff'),
                text(label, 25, 44, 23),
                text('Display-only masking. Original transcript is unchanged.', 25, 441, 13, '0xd5cfe2'),
                text('Edited stills - invented data, not anonymization.', 25, 470, 13, '0xbdb5cb'),
            ]), i))
    stages.extend([
        '[s0][s1]concat=n=2:v=1:a=0,fps=5,split[colors][pixels]',
        '[colors]palettegen=stats_mode=full:reserve_transparent=0[palette]',
        '[pixels][palette]paletteuse=dither=bayer:bayer_scale=3[gif]',
    ])
    run([(['-loop', '1', '-t', '3'], 'assets/screen-share.png'),
         (['-loop', '1', '-t', '3'], 'assets/screen-share.png')],
        ';'.join(stages), 'screen-share-example.gif')


if __name__ == '__main__':
    main()
