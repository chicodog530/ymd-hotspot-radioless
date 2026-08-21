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
        
        # TX State
        self.tx_seq = 0
        self.pcm_buffer = []
        self.sock = None
        self.dmrgw_addr = None
        self.bm_addr = None
        self.sniffed_repeater_id = None
        
        # Dynamic Modules
        self.vocoder = None
        self.dmr_encoder = None
        
        self.load_config()
        
    def load_config(self):
        try:
            with open("/etc/ywd-hotspot/config.json", "r") as f:
                c = json.load(f)
            self.bm_master = c.get("brandmeister", {}).get("master", "3102.master.brandmeister.network")
            self.bm_port = int(c.get("brandmeister", {}).get("port", 62031))
            self.callsign = c.get("station", {}).get("callsign", "NOCALL")
            self.dmr_id = int(c.get("station", {}).get("base_dmr_id", 1234567))
            logging.info(f"Loaded config: Callsign={self.callsign}, DMR ID={self.dmr_id}, Master={self.bm_master}:{self.bm_port}")
        except Exception as e:
            logging.error(f"Could not load config.json: {e}")
            self.bm_master = "3102.master.brandmeister.network"
            self.bm_port = 62031
            
    def start_jvm(self):
        # We replaced JMBE with the C vocoder for better stability and performance
        try:
            from vocoder import Vocoder
            self.vocoder = Vocoder()
            logging.info("C Vocoder initialized successfully for RX and TX.")
        except Exception as e:
            logging.error(f"Failed to load C Vocoder: {e}")
            sys.exit(1)

    def decode_ambe_to_pcm(self, ambe_data):
        if not getattr(self, 'vocoder', None): return None
        try:
            # We expect 27 bytes of ambe_data (3 frames of 9 bytes)
            all_pcm = []
            for i in range(0, len(ambe_data), 9):
                frame = ambe_data[i:i+9]
                if len(frame) == 9:
                    # decode_frame returns a list of int16
                    pcm_ints = self.vocoder.decode_frame(frame)
                    if pcm_ints:
                        # Convert int16 to float32 [-1.0, 1.0] for the browser Web Audio API
                        all_pcm.extend([x / 32768.0 for x in pcm_ints])
            return all_pcm
        except Exception as e:
            logging.error(f"Decode error: {e}")
            return None

    async def brandmeister_proxy(self):
        import socket
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind(("0.0.0.0", 62035))
        self.sock.setblocking(False)
        
        try:
            bm_ip = socket.gethostbyname(self.bm_master)
        except Exception:
            bm_ip = self.bm_master
        self.bm_addr = (bm_ip, self.bm_port)
        
        logging.info(f"Audio Bridge Proxy listening on 62035, forwarding to {self.bm_addr}")
        
        while True:
            now = asyncio.get_event_loop().time()
            
            # Drain the entire UDP buffer
            while True:
                try:
                    data, addr = self.sock.recvfrom(2048)
                except BlockingIOError:
                    break
                    
                if addr[0] == "127.0.0.1":
                    # From DMRGateway, forward to Brandmeister
                    self.dmrgw_addr = addr
                    if data.startswith(b"DMRL") and len(data) >= 8:
                        self.sniffed_repeater_id = data[4:8]
                        logging.info(f"Sniffed Repeater ID from DMRL: {self.sniffed_repeater_id.hex()}")
                    self.sock.sendto(data, self.bm_addr)
                else:
                    # From Brandmeister, forward to DMRGateway
                    if self.dmrgw_addr:
                        self.sock.sendto(data, self.dmrgw_addr)
                        
                    # Log packet signature for debugging
                    if len(data) >= 4 and not data.startswith(b"DMRP"):
                        if data.startswith(b"DMRD") and not getattr(self, "logged_dmrd", False):
                            self.dmrd_log_count = getattr(self, "dmrd_log_count", 0) + 1
                            logging.info(f"DMRD HEX DUMP [{self.dmrd_log_count}]: {data.hex()}")
                            if self.dmrd_log_count >= 5: self.logged_dmrd = True
                        elif not data.startswith(b"DMRD"):
                            logging.info(f"BM Packet: {data[:4]} len={len(data)}")
                    
                    # Intercept and decode voice frames
                    if data.startswith(b"DMRV") or data.startswith(b"DMRD"):
                        if getattr(self, "is_receiving", False) == False:
                            self.is_receiving = True
                            self.last_rx_seq = -1
                            if hasattr(self, 'vocoder') and self.vocoder:
                                self.vocoder.reset()
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
                                # Byte 15 contains Slot (0x80), Private/Group (0x40), Data (0x20), and Voice (0x10)
                                # A Voice burst ALWAYS has 0x10 set. We shouldn't check 0x20 because some Voice Sync bursts might set it.
                                is_voice = (data[15] & 0x10) == 0x10
                                
                                if is_voice:
                                    seq_no = data[4]
                                    if getattr(self, "last_rx_seq", -1) != -1:
                                        expected_seq = (self.last_rx_seq + 1) % 256
                                        missed = (seq_no - expected_seq) % 256
                                        if 0 < missed < 10:
                                            if self.connected_clients:
                                                silence = [0.0] * 480 * missed
                                                websockets.broadcast(self.connected_clients, struct.pack(f"<{len(silence)}f", *silence))
                                                
                                    self.last_rx_seq = seq_no
                                    
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
                try:
                    if isinstance(message, str):
                        data = json.loads(message)
                        logging.info(f"Control message: {data}")
                        if data.get("type") == "control":
                            self.current_tg = data.get("tg")
                        elif data.get("type") == "tx_start":
                            self.tx_tg = int(data.get("tg", "9990"))
                            call_type = data.get("call_type", "group")
                            self.tx_active = True
                            self.tx_seq = 0
                            self.burst_idx = 0
                            self.pcm_buffer = []
                            
                            # Initialize vocoder and encoder on demand
                            if not self.vocoder:
                                from vocoder import Vocoder
                                self.vocoder = Vocoder()
                            if not self.dmr_encoder:
                                from dmr_encoder import DMREncoder
                                self.dmr_encoder = DMREncoder(color_code=1, src_id=self.dmr_id, dst_id=self.tx_tg, call_type=call_type)
                            else:
                                self.dmr_encoder.dst_id = self.tx_tg
                                self.dmr_encoder.call_type = call_type
                            
                            # Generate Voice Header and transmit
                            if self.sock:
                                hdr = self.dmr_encoder.generate_voice_header()
                                pkt = self.dmr_encoder.pack_mmdvm_dmrd(hdr, 1, self.tx_seq, repeater_id=self.sniffed_repeater_id)
                                if self.bm_addr:
                                    self.sock.sendto(pkt, self.bm_addr)
                                if self.dmrgw_addr:
                                    self.sock.sendto(pkt, self.dmrgw_addr)
                                
                                if not hasattr(self, 'tx_log_count'): self.tx_log_count = 0
                                if self.tx_log_count < 10:
                                    logging.info(f"TX DMRD HEX DUMP [{self.tx_log_count}]: {pkt.hex()}")
                                    self.tx_log_count += 1
                                    
                                self.tx_seq = (self.tx_seq + 1) % 256
                                
                        elif data.get("type") == "tx_stop":
                            if self.tx_active and self.sock:
                                term = self.dmr_encoder.generate_voice_terminator()
                                pkt = self.dmr_encoder.pack_mmdvm_dmrd(term, 2, self.tx_seq, repeater_id=self.sniffed_repeater_id)
                                if self.bm_addr:
                                    self.sock.sendto(pkt, self.bm_addr)
                                if self.dmrgw_addr:
                                    self.sock.sendto(pkt, self.dmrgw_addr)
                                self.tx_seq = (self.tx_seq + 1) % 256
                            self.tx_active = False
                            
                    elif isinstance(message, bytes) and self.tx_active:
                        # Received Float32 PCM from Browser (8000 Hz)
                        floats = struct.unpack(f"<{len(message)//4}f", message)
                        
                        # Convert to int16
                        for f in floats:
                            s = int(f * 32767.0)
                            if s > 32767: s = 32767
                            if s < -32768: s = -32768
                            self.pcm_buffer.append(s)

                        # We need exactly 3 AMBE frames (3 * 160 = 480 samples) for one burst
                        while len(self.pcm_buffer) >= 480:
                            ambe_frames = []
                            for i in range(3):
                                chunk = self.pcm_buffer[:160]
                                self.pcm_buffer = self.pcm_buffer[160:]
                                ambe = self.vocoder.encode_frame(chunk)
                                ambe_frames.append(ambe)

                            # Generate Burst and Send
                            if self.sock:
                                burst = self.dmr_encoder.generate_voice_burst(ambe_frames, self.burst_idx)
                                pkt = self.dmr_encoder.pack_mmdvm_dmrd(burst, 0, self.tx_seq, self.burst_idx, repeater_id=self.sniffed_repeater_id)
                                if self.bm_addr:
                                    self.sock.sendto(pkt, self.bm_addr)
                                if self.dmrgw_addr:
                                    self.sock.sendto(pkt, self.dmrgw_addr)
                                
                                if not hasattr(self, 'tx_log_count'): self.tx_log_count = 0
                                if self.tx_log_count < 10:
                                    logging.info(f"TX DMRD HEX DUMP [{self.tx_log_count}]: {pkt.hex()}")
                                    self.tx_log_count += 1
                                    
                                self.tx_seq = (self.tx_seq + 1) % 256
                                self.burst_idx = (self.burst_idx + 1) % 6
                                
                                # Pace transmission to match the DMR 60ms voice frame timing
                                await asyncio.sleep(0.058)
                except Exception as e:
                    logging.error(f"Error inside handle_client message processing: {e}", exc_info=True)
                    self.tx_active = False
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
