import audioop
import base64


class TwilioAudioBridge:
    """Twilio μ-law 8 kHz ↔ OpenAI PCM16 24 kHz."""

    def __init__(self):
        self.up_state = None
        self.down_state = None

    def twilio_to_openai(self, b64_mulaw: str) -> bytes:
        mulaw = base64.b64decode(b64_mulaw)
        pcm8 = audioop.ulaw2lin(mulaw, 2)
        pcm24, self.up_state = audioop.ratecv(pcm8, 2, 1, 8000, 24000, self.up_state)
        return pcm24

    def openai_to_twilio(self, b64_pcm24: str) -> str:
        pcm24 = base64.b64decode(b64_pcm24)
        pcm8, self.down_state = audioop.ratecv(pcm24, 2, 1, 24000, 8000, self.down_state)
        mulaw = audioop.lin2ulaw(pcm8, 2)
        return base64.b64encode(mulaw).decode("ascii")
