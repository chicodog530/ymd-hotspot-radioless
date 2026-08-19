import dmr_utils3.bptc as bptc
import dmr_utils3.golay as golay
from dmr_utils3.const import SYNC
from bitarray import bitarray
import binascii

print("Encoder test")

dummy_lc = b'\x00' * 12
try:
    emb_lc = bptc.encode_emblc(dummy_lc)
    print(f"encode_emblc returned type: {type(emb_lc)}, len: {len(emb_lc)}")
except Exception as e:
    print(f"encode_emblc error: {e}")

try:
    head_lc = bptc.encode_header_lc(dummy_lc)
    print(f"encode_header_lc returned type: {type(head_lc)}, len: {len(head_lc)}")
except Exception as e:
    print(f"encode_header_lc error: {e}")
