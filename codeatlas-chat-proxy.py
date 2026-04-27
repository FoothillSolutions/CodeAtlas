#!/usr/bin/env python3
import json
import shutil
import signal
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = "127.0.0.1"
PORT = 7823
CLAUDE_BIN = shutil.which("claude")


def render_prompt(system: str, messages: list) -> str:
    parts = []
    if system:
        parts.append(system.strip())
        parts.append("")
    for msg in messages:
        role = msg.get("role", "user").upper()
        content = msg.get("content", "").rstrip()
        parts.append(f"=== {role} ===")
        parts.append(content)
        parts.append("")
    parts.append("=== ASSISTANT ===")
    return "\n".join(parts)


class Handler(BaseHTTPRequestHandler):
    def _cors_headers(self):
        # file:// origin sends Origin: null — must echo it literally, not "*"
        self.send_header("Access-Control-Allow-Origin", "null")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "ok": True,
                "claude": CLAUDE_BIN or None,
            }).encode())
            return
        self.send_error(404)

    def do_POST(self):
        if self.path != "/chat":
            return self.send_error(404)

        if not CLAUDE_BIN:
            self.send_response(503)
            self._cors_headers()
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"`claude` CLI not found on PATH. Install Claude Code first.")
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError) as e:
            self.send_response(400)
            self._cors_headers()
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(f"Bad request: {e}".encode())
            return

        prompt = render_prompt(body.get("system", ""), body.get("messages", []))

        self.send_response(200)
        self._cors_headers()
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        proc = subprocess.Popen(
            [CLAUDE_BIN, "--print", prompt],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            text=True,
        )

        try:
            assert proc.stdout is not None
            for chunk in iter(lambda: proc.stdout.read(64), ""):
                if not chunk:
                    break
                self.wfile.write(chunk.encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            proc.kill()
        finally:
            proc.wait(timeout=5)

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[chat-proxy] {fmt % args}\n")


def main():
    if not CLAUDE_BIN:
        print("WARNING: `claude` CLI not found on PATH. /chat will return 503.", file=sys.stderr)

    server = HTTPServer((HOST, PORT), Handler)
    print(f"CodeAtlas chat proxy listening on http://{HOST}:{PORT}", file=sys.stderr)
    print(f"Claude binary: {CLAUDE_BIN or 'NOT FOUND'}", file=sys.stderr)

    def shutdown(*_):
        print("\nShutting down...", file=sys.stderr)
        server.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    server.serve_forever()


if __name__ == "__main__":
    main()
