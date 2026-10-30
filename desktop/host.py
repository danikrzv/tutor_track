"""Private lifetime bridge: one readiness JSON line out, parent lifetime on stdin."""
import argparse
import json
from pathlib import Path
import sys
import threading
from urllib.request import build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--preferred-port',type=int,default=8765)
    args = parser.parse_args()
    base = f'http://127.0.0.1:{args.preferred_port}'
    owned = None
    verified = False
    if args.preferred_port:
        try:
            # Never send local identity checks through a configured HTTP proxy.
            with build_opener(ProxyHandler({})).open(base+'/api/desktop-health',timeout=0.7) as response:
                verified = response.geturl()==base+'/api/desktop-health' and json.loads(response.read(4096))==server.desktop_identity()
        except (OSError,ValueError):
            pass
    if not verified:
        server.initialize()
        owned = server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        owned.daemon_threads = True
        base = f'http://127.0.0.1:{owned.server_port}'
        threading.Thread(target=owned.serve_forever,daemon=True).start()
    try:
        print(json.dumps({'url':base,'owned':owned is not None}),flush=True)
        # EOF also happens if the wrapper crashes or is force-quit.
        while sys.stdin.buffer.read(1):
            pass
    finally:
        if owned:
            owned.shutdown()
            owned.server_close()


if __name__ == '__main__':
    main()
