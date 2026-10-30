"""Build the personal Mac app with the system Swift compiler; no downloads."""
from pathlib import Path
import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT/'build'


def run(*args):
    subprocess.run([str(arg) for arg in args],check=True)


def main():
    if sys.platform != 'darwin':
        raise SystemExit('The Mac app must be built on macOS with Xcode Command Line Tools.')
    BUILD.mkdir(exist_ok=True)
    # Keep the last working app intact until compilation and icon generation finish.
    with tempfile.TemporaryDirectory(prefix='tutortrack-build-',dir=BUILD) as folder:
        stage = Path(folder)
        app = stage/'TutorTrack.app'
        contents = app/'Contents'
        executable = contents/'MacOS'/'TutorTrack'
        resources = contents/'Resources'
        executable.parent.mkdir(parents=True)
        resources.mkdir()
        compiler = shutil.which('xcrun')
        if not compiler:
            raise SystemExit('Install the Xcode Command Line Tools, then run this command again.')
        cache = BUILD/'swift-cache'
        options = ['-swift-version','5','-module-cache-path',cache,'-target',os.uname().machine+'-apple-macosx12.0']
        run(compiler,'swiftc',*options,ROOT/'desktop/Policy.swift',ROOT/'desktop/TutorTrack.swift','-o',executable)
        run(compiler,'swiftc',*options,ROOT/'desktop/Icon.swift','-o',stage/'make-icon')
        run(stage/'make-icon',stage/'TutorTrack.iconset')
        run('/usr/bin/iconutil','-c','icns',stage/'TutorTrack.iconset','-o',resources/'TutorTrack.icns')
        candidates = [Path('/opt/homebrew/bin/python3'),Path('/usr/local/bin/python3'),Path(sys.executable)]
        python = next(path for path in candidates if path.is_file() and os.access(path,os.X_OK))
        (resources/'DesktopConfig.json').write_text(json.dumps({'project':str(ROOT),'python':str(python)},indent=2)+'\n')
        info = {
            'CFBundleName':'TutorTrack','CFBundleDisplayName':'TutorTrack',
            'CFBundleIdentifier':'local.tutortrack.desktop','CFBundleVersion':'1',
            'CFBundleShortVersionString':'1.0','CFBundlePackageType':'APPL',
            'CFBundleExecutable':'TutorTrack','CFBundleIconFile':'TutorTrack.icns',
            'LSMinimumSystemVersion':'12.0','NSHighResolutionCapable':True,
            'NSPrincipalClass':'NSApplication',
            'NSAppTransportSecurity':{'NSAllowsLocalNetworking':True},
            'NSHumanReadableCopyright':'TutorTrack · Your local teaching workspace',
        }
        (contents/'Info.plist').write_bytes(plistlib.dumps(info))
        run('/usr/bin/codesign','--force','--sign','-',app)
        run('/usr/bin/codesign','--verify','--deep','--strict',app)
        destination = BUILD/'TutorTrack.app'
        if destination.exists():
            old = stage/'previous.app'
            destination.rename(old)
        app.rename(destination)
    print(f'Built {destination}\nDouble-click it to open TutorTrack. Drag the app to Applications and choose Keep in Dock.')


if __name__ == '__main__':
    main()
