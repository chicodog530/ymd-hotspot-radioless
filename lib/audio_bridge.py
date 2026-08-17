#!/usr/bin/env python3
import asyncio
import json
import logging
import os
import sys
import struct
import configparser

try:
    import jpype
    import jpype.imports
    import websockets
except ImportError:
    print("Missing dependencies. Please run: pip3 install jpype1 websockets")
    sys.exit(1)

import glob

# Find the built JMBE jar regardless of version number
JMBE_JAR_PATTERN = os.path.join(os.path.dirname(__file__), "jmbe", "codec", "build", "libs", "jmbe-*.jar")
try:
    JMBE_JAR_PATH = glob.glob(JMBE_JAR_PATTERN)[0]
except IndexError:
    JMBE_JAR_PATH = "/path/not/found.jar"


class AudioBridge:
    def __init__(self):
        self.jmbe_lib = None
        self.ambe_codec = None
        self.seq = 0
        self.dmr_id = 0
        self.callsign = "NOCALL"
        self.connected_clients = set()
        self.load_config()
        
    def load_config(self):
        config = configparser.ConfigParser()
        try:
            # We assume the config file exists on the Pi
            config.read("/etc/ywd-hotspot/MMDVM-Host.ini")
            self.callsign = config.get("General", "Callsign", fallback="NOCALL")
            self.dmr_id = int(config.get("General", "Id", fallback="0"))
            logging.info(f"Loaded config: Callsign={self.callsign}, ID={self.dmr_id}")
        except Exception as e:
            logging.error(f"Could not load MMDVM-Host.ini, using defaults: {e}")
            
    def start_jvm(self):
        if not os.path.exists(JMBE_JAR_PATH):
            logging.error(f"JMBE jar not found at {JMBE_JAR_PATH}")
            sys.exit(1)
            
        logging.info("Starting JVM and loading JMBE...")
        if not jpype.isJVMStarted():
            jpype.startJVM(classpath=[JMBE_JAR_PATH])
            
        try:
            JMBEAudioLibrary = jpype.JClass("jmbe.JMBEAudioLibrary")
            self.jmbe_lib = JMBEAudioLibrary()
            self.ambe_codec = self.jmbe_lib.getAudioConverter("AMBE 3600 x 2450")
            logging.info("JMBE AMBE decoder initialized successfully.")
        except Exception as e:
            logging.error(f"Failed to load JMBE classes: {e}")
            sys.exit(1)

    def decode_ambe_to_pcm(self, ambe_data):
        if not self.ambe_codec: return None
        try:
            # We expect 27 bytes of ambe_data (3 frames of 9 bytes)
            all_pcm = []
            for i in range(0, len(ambe_data), 9):
                frame = ambe_data[i:i+9]
                if len(frame) == 9:
                    java_bytes = jpype.JArray(jpype.JByte)(frame)
                    pcm_floats = self.ambe_codec.getAudio(java_bytes)
                    if pcm_floats:
                        all_pcm.extend(list(pcm_floats))
            return all_pcm
        except Exception as e:
            logging.error(f"Decode error: {e}")
            return None

    async def brandmeister_client(self, host, port):
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setblocking(False)
        
        # Login to local DMRGateway (simulating MMDVMHost)
        login_pkt = b"DMRD" + struct.pack("!I", self.dmr_id) + self.callsign.encode().ljust(8, b'\0') + b'\0'*12
        logging.info(f"Connecting to DMRGateway at {host}:{port}...")
        sock.sendto(login_pkt, (host, port))
        
        self.bm_sock = sock
        self.bm_addr = (host, port)
        
        # Send a keep-alive every 5 seconds
        last_ping = asyncio.get_event_loop().time()
        
        while True:
            now = asyncio.get_event_loop().time()
            if now - last_ping > 5:
                # Send DMR ping
                sock.sendto(login_pkt, (host, port))
                last_ping = now
                
            try:
                data, addr = sock.recvfrom(1024)
                if data.startswith(b"DMRD"):
                    logging.info("DMRGateway Login Accepted!")
                elif data.startswith(b"DMRV"):
                    # Format: "DMRV" (4s), seq (B), src (I), dst (I), type (B), slot (B)
                    if len(data) >= 15:
                        ambe_data = data[15:42]
                        if ambe_data and self.connected_clients:
                            pcm_floats = self.decode_ambe_to_pcm(ambe_data)
                            if pcm_floats:
                                pcm_bytes = struct.pack(f"<{len(pcm_floats)}f", *pcm_floats)
                                websockets.broadcast(self.connected_clients, pcm_bytes)
            except BlockingIOError:
                pass
            
            await asyncio.sleep(0.02)

    async def handle_client(self, websocket, path):
        logging.info(f"New Web Terminal connected from {websocket.remote_address}")
        self.connected_clients.add(websocket)
        try:
            async for message in websocket:
                if isinstance(message, str):
                    data = json.loads(message)
                    logging.info(f"Control message: {data}")
                    if data.get("type") == "control":
                        self.current_tg = data.get("tg")
        except websockets.exceptions.ConnectionClosed:
            logging.info("Web Terminal disconnected.")
        finally:
            self.connected_clients.remove(websocket)
            
    async def serve(self, host="0.0.0.0", port=8081):
        self.start_jvm()
        # Connect to DMRGateway locally on 62031
        bm_task = asyncio.create_task(self.brandmeister_client("127.0.0.1", 62031))
        
        logging.info(f"Audio Bridge WebSocket listening on ws://{host}:{port}")
        async with websockets.serve(self.handle_client, host, port):
            await asyncio.Future()

if __name__ == "__main__":
    bridge = AudioBridge()
    try:
        asyncio.run(bridge.serve())
    except KeyboardInterrupt:
        logging.info("Shutting down Audio Bridge.")
        if jpype.isJVMStarted():
            jpype.shutdownJVM()
