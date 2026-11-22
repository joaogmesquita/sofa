"""Servidor local de transcrição para o Sofá.

Usa o openai-whisper já instalado (modelos em ~/.cache/whisper) e mantém o
modelo carregado. Recebe WAV 16 kHz mono 16-bit em POST /transcribe e
devolve {"text": "..."}. Escuta só em 127.0.0.1.
"""
import json
import os
import sys
import time
import wave
import io
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch
import whisper

MODEL = os.environ.get("SOFA_WHISPER_MODEL", "small")
PORT = int(os.environ.get("SOFA_WHISPER_PORT", "8790"))
PROMPT = "Comandos de TV: abrir Netflix, YouTube, Prime Video, Disney+, Jellyfin. Pausar, voltar, volume."

torch.set_num_threads(max(1, (os.cpu_count() or 4) // 2))
t0 = time.time()
model = whisper.load_model(MODEL)
print(f"[whisper] modelo {MODEL} carregado em {time.time() - t0:.1f}s", flush=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.reply(200, {"ok": True, "model": MODEL})

    def do_POST(self):
        if self.path != "/transcribe":
            return self.reply(404, {"error": "not found"})
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            with wave.open(io.BytesIO(data)) as w:
                audio = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
            t = time.time()
            r = model.transcribe(audio, language="pt", fp16=False, initial_prompt=PROMPT,
                                 condition_on_previous_text=False, temperature=0)
            text = r["text"].strip()
            print(f"[whisper] {time.time() - t:.1f}s: {text}", flush=True)
            self.reply(200, {"text": text})
        except Exception as e:  # áudio inválido etc.
            self.reply(400, {"error": str(e)})


ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
