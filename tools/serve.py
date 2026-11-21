#!/usr/bin/env python3
"""Static server for the game that tells the browser never to cache.

The game is plain ES modules with no build step, so a normal static server lets the browser keep
old copies of lesson and source files after an edit. Run:  python3 tools/serve.py [port]
"""
import http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()
    def log_message(self, *args):
        pass

if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
