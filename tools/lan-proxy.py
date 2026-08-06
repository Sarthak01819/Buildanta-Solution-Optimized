#!/usr/bin/env python3
"""Dumb TCP forwarder: 0.0.0.0:5285 -> 127.0.0.1:5280 (Vite dev).
Exists because macOS grants network permissions PER BINARY — python is
already blessed on this Mac, so the site stays reachable from the LAN even
if node's local-network permission acts up. Handles websockets fine (raw TCP)."""
import socket, threading, sys

LISTEN = ("0.0.0.0", int(sys.argv[1]) if len(sys.argv) > 1 else 5285)
TARGET = ("127.0.0.1", int(sys.argv[2]) if len(sys.argv) > 2 else 5280)

def pump(a, b):
    try:
        while True:
            d = a.recv(65536)
            if not d: break
            b.sendall(d)
    except OSError: pass
    finally:
        for s in (a, b):
            try: s.shutdown(socket.SHUT_RDWR)
            except OSError: pass

def handle(client):
    try:
        up = socket.create_connection(TARGET, timeout=5)
        up.settimeout(None)   # the connect timeout must NOT outlive the connect:
                              # it made every idle websocket die at 5s, and Vite
                              # answers a dead HMR socket with a full page reload
    except OSError: client.close(); return
    threading.Thread(target=pump, args=(client, up), daemon=True).start()
    threading.Thread(target=pump, args=(up, client), daemon=True).start()

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(LISTEN); srv.listen(64)
print(f"forwarding {LISTEN} -> {TARGET}")
while True:
    c, _ = srv.accept()
    handle(c)
