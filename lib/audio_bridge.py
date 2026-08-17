#!/usr/bin/env python3
import asyncio
import json
import logging
import os
import sys

# Optional dependencies that will need to be installed
try:
    import jpype
    import jpype.imports
    import websockets
except ImportError:
    print("Missing dependencies. Please run: pip3 install jpype1 websockets")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Path to our built JMBE jar
JMBE_JAR_PATH = os.path.join(os.path.dirname(__file__), "jmbe", "codec", "build", "libs", "jmbe-1.0.9.jar")

class AudioBridge:
    def __init__(self):
        self.jmbe_lib = None
        self.ambe_codec = None
        
    def start_jvm(self):
        """Starts the JVM and loads the JMBE library."""
        if not os.path.exists(JMBE_JAR_PATH):
            logging.error(f"JMBE jar not found at {JMBE_JAR_PATH}")
            sys.exit(1)
            
        logging.info("Starting JVM and loading JMBE...")
        if not jpype.isJVMStarted():
            jpype.startJVM(classpath=[JMBE_JAR_PATH])
            
        try:
            # JMBEAudioLibrary class from jmbe
            JMBEAudioLibrary = jpype.JClass("jmbe.JMBEAudioLibrary")
            self.jmbe_lib = JMBEAudioLibrary()
            # We want the AMBE+2 codec for DMR
            self.ambe_codec = self.jmbe_lib.getAudioConverter("AMBE")
            logging.info("JMBE AMBE codec initialized successfully.")
        except Exception as e:
            logging.error(f"Failed to load JMBE classes: {e}")
            sys.exit(1)

    def encode_pcm_to_ambe(self, pcm_data):
        """Convert PCM float array to AMBE byte array."""
        if not self.ambe_codec: return None
        # Use jpype to pass PCM data to Java and get AMBE back
        try:
            pcm_floats = jpype.JArray(jpype.JFloat)(pcm_data)
            ambe_bytes = self.ambe_codec.encode(pcm_floats)
            return bytes(ambe_bytes)
        except Exception as e:
            logging.error(f"Encode error: {e}")
            return None

    def decode_ambe_to_pcm(self, ambe_data):
        """Convert AMBE byte array to PCM float array."""
        if not self.ambe_codec: return None
        try:
            java_bytes = jpype.JArray(jpype.JByte)(ambe_data)
            pcm_floats = self.ambe_codec.decode(java_bytes)
            return list(pcm_floats)
        except Exception as e:
            logging.error(f"Decode error: {e}")
            return None

    async def brandmeister_client(self, host, port, password, callsign, dmr_id):
        """Maintains the UDP connection to BrandMeister using Homebrew Protocol."""
        import socket
        import struct
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setblocking(False)
        
        # simplified login packet
        login_pkt = b"DMRD" + struct.pack("!I", dmr_id) + callsign.encode().ljust(8, b'\0') + b'\0'*12
        
        logging.info(f"Connecting to BrandMeister {host}:{port}...")
        sock.sendto(login_pkt, (host, port))
        
        self.bm_sock = sock
        self.bm_addr = (host, port)
        
        while True:
            try:
                # Read incoming UDP packets from BM
                data, addr = sock.recvfrom(1024)
                if data.startswith(b"DMRD"):
                    logging.info("BrandMeister Login Accepted!")
                elif data.startswith(b"DMRV"):
                    # Voice frame received
                    # 1. Extract AMBE payload
                    ambe_payload = data[16:] 
                    # 2. Decode to PCM
                    pcm_floats = self.decode_ambe_to_pcm(ambe_payload)
                    # 3. Send PCM to WebSocket clients
                    if pcm_floats:
                        # Broadcast to UI
                        pass
            except BlockingIOError:
                pass
            
            await asyncio.sleep(0.02) # 20ms poll rate for DMR frames

    async def handle_client(self, websocket, path):
        """Handles a browser WebSocket connection for streaming audio."""
        logging.info(f"New Web Terminal connected from {websocket.remote_address}")
        try:
            async for message in websocket:
                if isinstance(message, str):
                    data = json.loads(message)
                    logging.info(f"Control message: {data}")
                    if data.get("type") == "control":
                        self.is_transmitting = data.get("ptt", False)
                        self.current_tg = data.get("tg")
                elif isinstance(message, bytes):
                    # PCM Audio from browser microphone (16-bit PCM)
                    import struct
                    # Convert bytes to floats for JMBE
                    count = len(message) // 2
                    shorts = struct.unpack(f"<{count}h", message)
                    pcm_floats = [s / 32768.0 for s in shorts]
                    
                    if getattr(self, "is_transmitting", False) and hasattr(self, "bm_sock"):
                        ambe_data = self.encode_pcm_to_ambe(pcm_floats)
                        if ambe_data:
                            # Construct DMR voice frame
                            # Simplified header for example purposes
                            dmr_frame = b"DMRV" + b"\0"*12 + ambe_data
                            self.bm_sock.sendto(dmr_frame, self.bm_addr)
        except websockets.exceptions.ConnectionClosed:
            logging.info("Web Terminal disconnected.")
            
    async def serve(self, host="0.0.0.0", port=8081):
        """Starts the WebSocket server and BM Client."""
        self.start_jvm()
        
        # Start the BM UDP client in background
        bm_task = asyncio.create_task(self.brandmeister_client("3102.master.brandmeister.network", 62031, "PASSWORD", "KJ6YWD", 3100000))
        
        logging.info(f"Audio Bridge WebSocket listening on ws://{host}:{port}")
        async with websockets.serve(self.handle_client, host, port):
            await asyncio.Future()  # Run forever

if __name__ == "__main__":
    bridge = AudioBridge()
    try:
        asyncio.run(bridge.serve())
    except KeyboardInterrupt:
        logging.info("Shutting down Audio Bridge.")
        if jpype.isJVMStarted():
            jpype.shutdownJVM()
