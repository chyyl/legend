#!/usr/bin/env python3
"""
serve_dev.py — Development server with no-cache headers for ES Modules
Usage: python serve_dev.py [port]
Default port: 8091
"""

import http.server
import socketserver
import sys
import os
from pathlib import Path

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching for development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        # CORS for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        # Cleaner log format
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8091

    # Serve from project root
    os.chdir(Path(__file__).parent)

    with socketserver.TCPServer(("", port), NoCacheHandler) as httpd:
        print(f"[*] Project Emancipate Dev Server")
        print(f"   Serving at: http://localhost:{port}")
        print(f"   Game:       http://localhost:{port}/index.html")
        print(f"   Editor:     http://localhost:{port}/editor.html")
        print(f"   Press Ctrl+C to stop")
        print(f"   Cache-Control: no-cache (ES Modules ready)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[*] Server stopped")

if __name__ == '__main__':
    main()