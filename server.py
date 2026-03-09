#!/usr/bin/env python3
"""
Auto-reloading development server for Massage School project.
Run: python server.py
Then open http://localhost:8000
"""

import http.server
import os
import threading
import time
import hashlib
from pathlib import Path

PORT = 8000
WATCH_DIR = Path(__file__).parent
WATCH_EXTENSIONS = {'.html', '.css', '.js', '.json'}

# Shared state
file_hashes = {}
change_event = threading.Event()

LIVERELOAD_SCRIPT = """
<script>
(function() {
  var es = new EventSource('/__livereload__');
  es.onmessage = function(e) {
    if (e.data === 'reload') setTimeout(function() { location.reload(); }, 5000);
  };
  es.onerror = function() {
    // reconnect after 1s if connection drops
    es.close();
    setTimeout(function() { location.reload(); }, 1000);
  };
})();
</script>
</body>
"""

def get_file_hash(path):
    try:
        return hashlib.md5(path.read_bytes()).hexdigest()
    except Exception:
        return None

def watch_files():
    global file_hashes
    # Initialize hashes
    for f in WATCH_DIR.rglob('*'):
        if f.suffix in WATCH_EXTENSIONS and f.is_file():
            file_hashes[f] = get_file_hash(f)

    while True:
        time.sleep(0.5)
        for f in WATCH_DIR.rglob('*'):
            if f.suffix not in WATCH_EXTENSIONS or not f.is_file():
                continue
            h = get_file_hash(f)
            if file_hashes.get(f) != h:
                file_hashes[f] = h
                print(f'  changed: {f.name}')
                change_event.set()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WATCH_DIR), **kwargs)

    def do_GET(self):
        if self.path == '/__livereload__':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                while True:
                    change_event.wait(timeout=30)
                    if change_event.is_set():
                        change_event.clear()
                        self.wfile.write(b'data: reload\n\n')
                        self.wfile.flush()
                        time.sleep(5)
                    else:
                        # heartbeat
                        self.wfile.write(b': ping\n\n')
                        self.wfile.flush()
            except Exception:
                return
        else:
            super().do_GET()

    def send_head(self):
        # Inject livereload script into HTML responses
        path = self.translate_path(self.path)
        if path.endswith('.html') or self.path in ('/', ''):
            try:
                if os.path.isdir(path):
                    path = os.path.join(path, 'index.html')
                with open(path, 'rb') as f:
                    content = f.read()
                modified = content.replace(b'</body>', LIVERELOAD_SCRIPT.encode())
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(modified)))
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                return __import__('io').BytesIO(modified)
            except Exception:
                pass
        return super().send_head()

    def log_message(self, format, *args):
        msg = str(args[0]) if args else ''
        if '__livereload__' not in msg and 'favicon.ico' not in msg:
            print(f'  {format % args}')


if __name__ == '__main__':
    watcher = threading.Thread(target=watch_files, daemon=True)
    watcher.start()

    with http.server.ThreadingHTTPServer(('', PORT), Handler) as httpd:
        print(f'Serving at http://localhost:{PORT}')
        print(f'Watching: {WATCH_DIR}')
        print('Press Ctrl+C to stop.\n')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nStopped.')