import json
import os
from pathlib import Path
from typing import Any

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    system_prompt: str = Field(default="", max_length=8000)
    max_tokens: int = Field(default=500, ge=32, le=1200)
    temperature: float = Field(default=0.2, ge=0.0, le=1.5)


class GenerateResponse(BaseModel):
    text: str
    model: str
    device: str


def sanitize_model_name(model_id: str) -> str:
    return model_id.replace("/", "__").replace(":", "_")


def load_local_env(root_dir: Path) -> None:
    env_path = root_dir / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        if key and value and not os.getenv(key):
            os.environ[key] = value


def resolve_model(root_dir: Path) -> tuple[str, Path]:
    model_id = os.getenv("LOCAL_LLM_MODEL_NAME", "Qwen/Qwen2.5-0.5B-Instruct").strip()
    models_dir = Path(os.getenv("LOCAL_LLM_MODELS_DIR", root_dir / "models")).resolve()
    model_dir = Path(os.getenv("LOCAL_LLM_MODEL_DIR", models_dir / sanitize_model_name(model_id))).resolve()

    info_path = root_dir / "model_info.json"
    if info_path.exists() and not model_dir.exists():
        try:
            info = json.loads(info_path.read_text(encoding="utf-8"))
            model_id = str(info.get("model_id") or model_id)
            info_dir = str(info.get("model_dir") or "").strip()
            if info_dir:
                model_dir = Path(info_dir).resolve()
        except Exception:
            pass

    if not model_dir.exists():
        raise RuntimeError(
            "Local model folder was not found. Run setup_project.bat (or python local_llm/download_model.py)."
        )

    return model_id, model_dir


def resolve_device() -> tuple[str, Any, dict[str, Any]]:
    if torch.cuda.is_available():
        return "cuda", torch.float16, {"device_map": "auto"}
    return "cpu", torch.float32, {}


ROOT_DIR = Path(__file__).resolve().parent
load_local_env(ROOT_DIR)
MODEL_ID, MODEL_DIR = resolve_model(ROOT_DIR)
DEVICE, DTYPE, EXTRA_MODEL_KW = resolve_device()

TOKENIZER = AutoTokenizer.from_pretrained(MODEL_DIR, local_files_only=True)
MODEL = AutoModelForCausalLM.from_pretrained(
    MODEL_DIR,
    local_files_only=True,
    dtype=DTYPE,
    low_cpu_mem_usage=True,
    **EXTRA_MODEL_KW,
)
if DEVICE == "cpu":
    MODEL.to("cpu")

APP = FastAPI(title="Aqbobek Local LLM", version="1.0.0")


def build_prompt(request: GenerateRequest) -> str:
    messages: list[dict[str, str]] = []
    if request.system_prompt.strip():
        messages.append({"role": "system", "content": request.system_prompt.strip()})
    messages.append({"role": "user", "content": request.prompt.strip()})

    if hasattr(TOKENIZER, "apply_chat_template"):
        return TOKENIZER.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

    return "\n\n".join([
        request.system_prompt.strip() if request.system_prompt.strip() else "",
        request.prompt.strip(),
    ]).strip()


def generate_text(request: GenerateRequest) -> str:
    prompt_text = build_prompt(request)
    inputs = TOKENIZER(prompt_text, return_tensors="pt")
    if DEVICE == "cuda":
        inputs = {name: tensor.to(MODEL.device) for name, tensor in inputs.items()}

    do_sample = request.temperature > 0
    kwargs = {
        "max_new_tokens": request.max_tokens,
        "do_sample": do_sample,
        "temperature": max(request.temperature, 0.01) if do_sample else None,
        "top_p": 0.9 if do_sample else None,
        "pad_token_id": TOKENIZER.eos_token_id,
    }
    kwargs = {key: value for key, value in kwargs.items() if value is not None}

    with torch.inference_mode():
        outputs = MODEL.generate(**inputs, **kwargs)

    input_len = inputs["input_ids"].shape[-1]
    generated_ids = outputs[0][input_len:]
    return TOKENIZER.decode(generated_ids, skip_special_tokens=True).strip()


@APP.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_ID, "device": DEVICE}


@APP.post("/v1/generate", response_model=GenerateResponse)
def generate(request: GenerateRequest) -> GenerateResponse:
    try:
        text = generate_text(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Local LLM failed: {exc}") from exc

    if not text:
        raise HTTPException(status_code=500, detail="Local LLM returned empty text")

    return GenerateResponse(text=text, model=MODEL_ID, device=DEVICE)


app = APP


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("LOCAL_LLM_HOST", "127.0.0.1")
    port = int(os.getenv("LOCAL_LLM_PORT", "8009"))
    uvicorn.run("app:app", host=host, port=port, reload=False)
