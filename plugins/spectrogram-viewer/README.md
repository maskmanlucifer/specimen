# Spectrogram viewer

Link an audio card to the `audio` input. The figure computes an STFT (Hann window, 50% overlap)
of the clip resampled to 11 kHz, draws 0–2.2 kHz, and marks the strongest local maxima.

- **FFT window**: 512, 1024 or 2048 samples. 1024 at 11 kHz ≈ 93 ms per column.
- **Peak density**: peaks per second of audio.
