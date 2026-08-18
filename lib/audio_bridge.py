#!/usr/bin/env python3
import asyncio
import json
import logging
import os
import sys
import struct
import configparser
import glob

try:
    import jpype
    import jpype.imports
    import websockets
except ImportError:
    print("Missing dependencies. Please run: pip3 install jpype1 websockets")
    sys.exit(1)

# Setup logging
logging.basicConfig(level=logging.INFO)

# Find the built JMBE jars regardless of version number
JMBE_API_JAR_PATTERN = os.path.join(os.path.dirname(__file__), "jmbe", "api", "build", "libs", "jmbe-api-*.jar")
JMBE_JAR_PATTERN = os.path.join(os.path.dirname(__file__), "jmbe", "codec", "build", "libs", "jmbe-*.jar")
JMBE_DEPS_PATTERN = os.path.join(os.path.dirname(__file__), "jmbe", "deps", "*.jar")
try:
    JMBE_API_JAR_PATH = glob.glob(JMBE_API_JAR_PATTERN)[0]
    JMBE_JAR_PATH = glob.glob(JMBE_JAR_PATTERN)[0]
    JMBE_CLASSPATH = [JMBE_API_JAR_PATH, JMBE_JAR_PATH]
    JMBE_CLASSPATH.extend(glob.glob(JMBE_DEPS_PATTERN))
except IndexError:
    JMBE_CLASSPATH = []


class AudioBridge:
    def __init__(self):
        self.jmbe_lib = None
        self.ambe_codec = None
        self.seq = 0
        self.dmr_id = 0
        self.callsign = "NOCALL"
        self.connected_clients = set()
        self.is_receiving = False
        self.load_config()
        
    def load_config(self):
        try:
            with open("/etc/ywd-hotspot/config.json", "r") as f:
                c = json.load(f)
            self.bm_master = c.get("brandmeister", {}).get("master", "3102.master.brandmeister.network")
            self.bm_port = int(c.get("brandmeister", {}).get("port", 62031))
            self.callsign = c.get("station", {}).get("callsign", "NOCALL")
            logging.info(f"Loaded config: Callsign={self.callsign}, Master={self.bm_master}:{self.bm_port}")
        except Exception as e:
            logging.error(f"Could not load config.json: {e}")
            self.bm_master = "3102.master.brandmeister.network"
            self.bm_port = 62031
            
    def start_jvm(self):
        if not JMBE_CLASSPATH:
            logging.error("JMBE jars not found!")
            sys.exit(1)
            
        logging.info("Starting JVM and loading JMBE...")
        if not jpype.isJVMStarted():
            jvm_path = "/usr/lib/jvm/java-21-openjdk-armhf/lib/client/libjvm.so"
            jpype.startJVM(jvm_path, classpath=JMBE_CLASSPATH)
            
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

    async def brandmeister_proxy(self):
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", 62035))
        sock.setblocking(False)
        
        try:
            bm_ip = socket.gethostbyname(self.bm_master)
        except Exception:
            bm_ip = self.bm_master
        bm_addr = (bm_ip, self.bm_port)
        
        dmrgw_addr = None
        logging.info(f"Audio Bridge Proxy listening on 62035, forwarding to {bm_addr}")
        
        while True:
            now = asyncio.get_event_loop().time()
            try:
                data, addr = sock.recvfrom(2048)
                if addr[0] == "127.0.0.1":
                    # From DMRGateway, forward to Brandmeister
                    dmrgw_addr = addr
                    sock.sendto(data, bm_addr)
                else:
                    # From Brandmeister, forward to DMRGateway
                    if dmrgw_addr:
                        sock.sendto(data, dmrgw_addr)
                        
                    # Log packet signature for debugging
                    if len(data) >= 4 and not data.startswith(b"DMRP"):
                        logging.info(f"BM Packet: {data[:4]} len={len(data)}")
                    
                    # Intercept and decode voice frames
                    if data.startswith(b"DMRV") or data.startswith(b"DMRD"):
                        if getattr(self, "is_receiving", False) == False:
                            self.is_receiving = True
                            if self.connected_clients:
                                websockets.broadcast(self.connected_clients, json.dumps({
                                    "type": "rx_start",
                                    "callsign": "Network",
                                    "tg": "Audio"
                                }))
                        self.last_voice = now
                        
                        ambe_data = None
                        
                        # Handle BrandMeister Homebrew (DMRV) which is pre-extracted 27-byte AMBE
                        if data.startswith(b"DMRV") and len(data) >= 42:
                            ambe_data = data[15:42]
                            
                        # Handle BrandMeister MMDVM (DMRD) which is a 55-byte packet containing a 33-byte RF frame
                        elif data.startswith(b"DMRD") and len(data) >= 53:
                            try:
                                # Byte 15 contains Slot (0x80) and Data/Voice flag (0x40)
                                is_voice = (data[15] & 0x40) == 0
                                
                                if is_voice:
                                    import dmr_utils3.decode as dmr
                                    # The MMDVM Homebrew header is 20 bytes long. The 33-byte RF frame starts at byte 20.
                                    rf_frame = data[20:53]
                                    v = dmr.voice(rf_frame)
                                    ambe_data = v['AMBE'][0].tobytes() + v['AMBE'][1].tobytes() + v['AMBE'][2].tobytes()
                            except ImportError:
                                logging.error("dmr_utils3 not installed, cannot decode MMDVM RF frames")
                            except Exception as e:
                                logging.error(f"Error extracting AMBE from DMRD: {e}")
                                
                        if ambe_data and self.connected_clients:
                            # A DMR voice burst contains THREE 9-byte AMBE frames (60ms of audio total)
                            all_pcm_floats = []
                            for i in range(3):
                                chunk = ambe_data[i*9 : (i+1)*9]
                                if len(chunk) == 9:
                                    pcm_floats = self.decode_ambe_to_pcm(chunk)
                                    if pcm_floats:
                                        all_pcm_floats.extend(pcm_floats)
                            
                            if all_pcm_floats:
                                pcm_bytes = struct.pack(f"<{len(all_pcm_floats)}f", *all_pcm_floats)
                                websockets.broadcast(self.connected_clients, pcm_bytes)
            except BlockingIOError:
                pass
                
            if getattr(self, "is_receiving", False) and now - getattr(self, "last_voice", 0) > 1.5:
                self.is_receiving = False
                if self.connected_clients:
                    websockets.broadcast(self.connected_clients, json.dumps({
                        "type": "rx_stop"
                    }))
            
            await asyncio.sleep(0.005)

    async def handle_client(self, websocket):
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
        # Start transparent proxy
        bm_task = asyncio.create_task(self.brandmeister_proxy())
        
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
