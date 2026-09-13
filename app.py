"""
Ist_Mix_Music - Local Server & Mobile Host
Starts an HTTP server, automatically opens your browser on PC,
and displays your local WiFi IP so you can open it on your smartphone!
"""

import os
import sys
import socket
import webbrowser
import http.server
import socketserver

# Ensure Windows console handles UTF-8 safely
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PORT = 8080

def get_local_ip():
    """Gets the local WiFi / LAN IP address for mobile phone access."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't actually connect, just probes the outgoing interface
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

def run_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    local_ip = get_local_ip()

    Handler = http.server.SimpleHTTPRequestHandler
    
    # Enable address reuse
    socketserver.TCPServer.allow_reuse_address = True

    port = PORT
    for p in range(PORT, PORT + 10):
        try:
            httpd = socketserver.TCPServer(("", p), Handler)
            port = p
            break
        except OSError:
            continue

    local_url = f"http://localhost:{port}"
    mobile_url = f"http://{local_ip}:{port}"

    print("=" * 60)
    print("  >>  I S T _ M I X _ M U S I K   S E R V E R  <<")
    print("=" * 60)
    print(f"\n[PC BROWSER]      -> {local_url}")
    print(f"[HANDY / MOBILE]  -> {mobile_url}")
    print("\n💡 Tipp: Öffne die HANDY-URL im Smartphone-Browser (im gleichen WLAN)!")
    print("Drücke STRG + C zum Beenden des Servers.\n")

    # If --test flag, exit after printing
    if "--test" in sys.argv:
        print("[TEST] Server configured successfully.")
        return

    # Open browser on PC
    try:
        webbrowser.open(local_url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer wird beendet...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
