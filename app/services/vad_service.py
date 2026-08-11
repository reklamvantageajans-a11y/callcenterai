import ssl
import torch
import numpy as np

ssl._create_default_https_context = ssl._create_unverified_context

SILERO_SR = 16000
SILERO_CHUNK = 512

class SileroVADService:
    def __init__(self, input_sample_rate: int = 24000, threshold: float = 0.5):
        self.input_sample_rate = input_sample_rate
        self.threshold = threshold
        self._buffer = np.array([], dtype=np.float32)
        self.model, _ = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            force_reload=False,
            trust_repo=True
        )
        self.model.eval()

    def _resample(self, audio: np.ndarray) -> np.ndarray:
        if self.input_sample_rate == SILERO_SR:
            return audio
        out_len = int(len(audio) * SILERO_SR / self.input_sample_rate)
        if out_len == 0:
            return np.array([], dtype=np.float32)
        x_in = np.linspace(0, 1, len(audio))
        x_out = np.linspace(0, 1, out_len)
        return np.interp(x_out, x_in, audio).astype(np.float32)

    def process_chunk(self, pcm_bytes: bytes) -> float:
        if not pcm_bytes:
            return 0.0
        audio_int16 = np.frombuffer(pcm_bytes, dtype=np.int16)
        if len(audio_int16) == 0:
            return 0.0
        audio_f32 = audio_int16.astype(np.float32) / 32768.0
        resampled = self._resample(audio_f32)
        self._buffer = np.concatenate([self._buffer, resampled])

        max_prob = 0.0
        while len(self._buffer) >= SILERO_CHUNK:
            chunk = self._buffer[:SILERO_CHUNK]
            self._buffer = self._buffer[SILERO_CHUNK:]
            tensor = torch.from_numpy(chunk)
            with torch.no_grad():
                prob = self.model(tensor, SILERO_SR).item()
            if prob > max_prob:
                max_prob = prob

        return float(max_prob)

class StreamVADTracker:
    def __init__(self, vad_service: SileroVADService, threshold: float = 0.5,
                 start_trigger_chunks: int = 2, end_trigger_chunks: int = 10):
        self.vad_service = vad_service
        self.threshold = threshold
        self.start_trigger_chunks = start_trigger_chunks
        self.end_trigger_chunks = end_trigger_chunks
        self.is_speaking = False
        self.consecutive_speech = 0
        self.consecutive_silence = 0

    def process(self, pcm_bytes: bytes) -> dict:
        speech_prob = self.vad_service.process_chunk(pcm_bytes)
        is_speech = speech_prob >= self.threshold

        speech_started = False
        speech_ended = False

        if is_speech:
            self.consecutive_speech += 1
            self.consecutive_silence = 0
            if not self.is_speaking and self.consecutive_speech >= self.start_trigger_chunks:
                self.is_speaking = True
                speech_started = True
        else:
            self.consecutive_silence += 1
            if self.is_speaking and self.consecutive_silence >= self.end_trigger_chunks:
                self.is_speaking = False
                speech_ended = True
                self.consecutive_speech = 0

        return {
            "speech_prob": speech_prob,
            "is_speech": is_speech,
            "is_speaking": self.is_speaking,
            "speech_started": speech_started,
            "speech_ended": speech_ended
        }
