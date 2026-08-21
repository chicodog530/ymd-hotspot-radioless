import ctypes
import os
import logging
from typing import List

class Vocoder:
    def __init__(self, lib_path="/opt/ywd-hotspot/app/lib/vocoder/vocoder.so"):
        if not os.path.exists(lib_path):
            raise RuntimeError(f"Vocoder plugin not found at {lib_path}. Did you compile it?")
            
        self.lib = ctypes.CDLL(lib_path)
        
        # extern "C" Vocoder* create()
        self.lib.create.restype = ctypes.c_void_p
        
        # extern "C" void destroy(Vocoder* p)
        self.lib.destroy.argtypes = [ctypes.c_void_p]
        
        # extern "C" void encode_2450x1150_c(Vocoder* p, int16_t *pcm, uint8_t *codec)
        self.lib.encode_2450x1150_c.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int16), ctypes.POINTER(ctypes.c_uint8)]
        
        # extern "C" void decode_2450x1150_c(Vocoder* p, int16_t *pcm, uint8_t *codec)
        self.lib.decode_2450x1150_c.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int16), ctypes.POINTER(ctypes.c_uint8)]
        
        self.obj = self.lib.create()
        if not self.obj:
            raise RuntimeError("Failed to create Vocoder object.")
            
    def __del__(self):
        if hasattr(self, 'lib') and hasattr(self, 'obj') and self.lib and self.obj:
            try:
                self.lib.destroy(self.obj)
            except:
                pass
                
    def reset(self):
        """Reset the vocoder state to prevent cross-transmission garbling"""
        if hasattr(self, 'lib') and hasattr(self, 'obj') and self.lib:
            try:
                self.lib.destroy(self.obj)
            except:
                pass
            self.obj = self.lib.create()

    def encode_frame(self, pcm_samples: List[int]) -> bytes:
        """
        Encode 160 PCM samples (16-bit) into 9 bytes of AMBE data (2450x1150).
        """
        if len(pcm_samples) != 160:
            raise ValueError(f"AMBE encoding requires exactly 160 samples, got {len(pcm_samples)}")
            
        # Prepare input array
        PcmArray = ctypes.c_int16 * 160
        pcm_in = PcmArray(*pcm_samples)
        
        # Prepare output buffer (72 bits = 9 bytes)
        CodecArray = ctypes.c_uint8 * 9
        codec_out = CodecArray()
        
        # Call C function
        self.lib.encode_2450x1150_c(self.obj, pcm_in, codec_out)
        
        return bytes(codec_out)

    def decode_frame(self, ambe_data: bytes) -> List[int]:
        """
        Decode 9 bytes of AMBE data into 160 PCM samples (16-bit).
        """
        if len(ambe_data) != 9:
            raise ValueError(f"AMBE decoding requires exactly 9 bytes, got {len(ambe_data)}")
            
        # Prepare input buffer
        CodecArray = ctypes.c_uint8 * 9
        codec_in = CodecArray(*ambe_data)
        
        # Prepare output array
        PcmArray = ctypes.c_int16 * 160
        pcm_out = PcmArray()
        
        # Call C function
        self.lib.decode_2450x1150_c(self.obj, pcm_out, codec_in)
        
        return list(pcm_out)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    try:
        v = Vocoder()
        logging.info("Vocoder plugin loaded successfully.")
        
        # Test encode
        samples = [0] * 160
        encoded = v.encode_frame(samples)
        logging.info(f"Test encode gave {len(encoded)} bytes: {encoded.hex()}")
        
        # Test decode
        decoded = v.decode_frame(encoded)
        logging.info(f"Test decode gave {len(decoded)} samples.")
    except Exception as e:
        logging.error(f"Failed: {e}")
