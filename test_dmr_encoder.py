from lib.dmr_encoder import DMREncoder

encoder = DMREncoder(color_code=1, src_id=1234567, dst_id=9990)
try:
    vh = encoder.generate_voice_header()
    print("Voice Header length:", len(vh))
except Exception as e:
    print("Voice Header error:", e)

try:
    vb = encoder.generate_voice_burst([b'\x00'*9]*3, 0)
    print("Voice Burst length:", len(vb))
except Exception as e:
    print("Voice Burst error:", e)

try:
    pkt = encoder.pack_mmdvm_dmrd(vh, 1, 0)
    print("Packet length:", len(pkt))
except Exception as e:
    print("Packet error:", e)
