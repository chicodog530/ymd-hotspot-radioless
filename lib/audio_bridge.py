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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

JMBE_JAR_PATH = os.path.join(os.path.dirname(__file__), "jmbe", "codec", "build", "libs", "jmbe-1.0.9.jar")

class AudioBridge:
    def __init__(self):
        self.jmbe_lib = None
        self.ambe_codec = None
        self.seq = 0
        self.dmr_id = 0
        self.callsign = "NOCALL"
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
            self.ambe_codec = self.jmbe_lib.getAudioConverter("AMBE")
            logging.info("JMBE AMBE codec initialized successfully.")
        except Exception as e:
            logging.error(f"Failed to load JMBE classes: {e}")
            sys.exit(1)

    def encode_pcm_to_ambe(self, pcm_data):
        if not self.ambe_codec: return None
        try:
            pcm_floats = jpype.JArray(jpype.JFloat)(pcm_data)
            ambe_bytes = self.ambe_codec.encode(pcm_floats)
            return bytes(ambe_bytes)
        except Exception as e:
            logging.error(f"Encode error: {e}")
            return None

    def decode_ambe_to_pcm(self, ambe_data):
        if not self.ambe_codec: return None
        try:
            java_bytes = jpype.JArray(jpype.JByte)(ambe_data)
            pcm_floats = self.ambe_codec.decode(java_bytes)
            return list(pcm_floats)
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
                    # Process incoming voice here later
                    pass
            except BlockingIOError:
                pass
            
            await asyncio.sleep(0.02)

    async def handle_client(self, websocket, path):
        logging.info(f"New Web Terminal connected from {websocket.remote_address}")
        try:
            async for message in websocket:
                if isinstance(message, str):
                    data = json.loads(message)
                    logging.info(f"Control message: {data}")
                    if data.get("type") == "control":
                        self.is_transmitting = data.get("ptt", False)
                        self.current_tg = data.get("tg")
                        # Reset sequence number when PTT starts
                        if self.is_transmitting:
                            self.seq = 0
                elif isinstance(message, bytes):
                    count = len(message) // 2
                    shorts = struct.unpack(f"<{count}h", message)
                    pcm_floats = [s / 32768.0 for s in shorts]
                    
                    if getattr(self, "is_transmitting", False) and hasattr(self, "bm_sock"):
                        ambe_data = self.encode_pcm_to_ambe(pcm_floats)
                        if ambe_data:
                            # Construct valid MMDVM DMR voice frame
                            try:
                                tg = int(self.current_tg) if getattr(self, "current_tg", None) else 91
                            except ValueError:
                                tg = 91
                                
                            seq = self.seq % 256
                            self.seq += 1
                            
                            # Format: "DMRV" (4s), seq (B), src (I), dst (I), type (B), slot (B)
                            # Type 1 = Group, Slot 2 = TS2
                            header = struct.pack("!4s B I I B B", b"DMRV", seq, self.dmr_id, tg, 1, 2)
                            dmr_frame = header + ambe_data
                            self.bm_sock.sendto(dmr_frame, self.bm_addr)
        except websockets.exceptions.ConnectionClosed:
            logging.info("Web Terminal disconnected.")
            
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
