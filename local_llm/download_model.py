import json
import os
from pathlib import Path

from huggingface_hub import snapshot_download

try:
    import torch
except Exception:
    torch = None

DEFAULT_CPU_MODEL = "Qwen/Qwen2.5-0.5B-Instruct"
DEFAULT_GPU_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"


def has_cuda() -> bool:
    if torch is None:
        return False
    try:
        return bool(torch.cuda.is_available())
    except Exception:
        return False


def resolve_model_id() -> str:
    explicit = os.getenv("LOCAL_LLM_MODEL_NAME", "").strip()
    if explicit:
        return explicit
    return DEFAULT_GPU_MODEL if has_cuda() else DEFAULT_CPU_MODEL


def sanitize_model_name(model_id: str) -> str:
    return model_id.replace("/", "__").replace(":", "_")


def main() -> None:
    root_dir = Path(__file__).resolve().parent
    models_dir = Path(os.getenv("LOCAL_LLM_MODELS_DIR", root_dir / "models")).resolve()
    models_dir.mkdir(parents=True, exist_ok=True)

    model_id = resolve_model_id()
    model_dir = Path(os.getenv("LOCAL_LLM_MODEL_DIR", models_dir / sanitize_model_name(model_id))).resolve()

    print(f"[local-llm] Target model: {model_id}")
    print(f"[local-llm] Model dir: {model_dir}")

    snapshot_download(
        repo_id=model_id,
        local_dir=str(model_dir),
        local_dir_use_symlinks=False,
        resume_download=True,
    )

    info = {
        "model_id": model_id,
        "model_dir": str(model_dir),
        "device_profile": "cuda" if has_cuda() else "cpu",
    }

    info_path = root_dir / "model_info.json"
    info_path.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")

    env_path = root_dir / ".env.local"
    env_content = "\n".join(
        [
            f"LOCAL_LLM_MODEL_NAME={model_id}",
            f"LOCAL_LLM_MODEL_DIR={model_dir}",
            f"LOCAL_LLM_MODELS_DIR={models_dir}",
        ]
    )
    env_path.write_text(env_content + "\n", encoding="utf-8")

    print(f"[local-llm] Saved model info: {info_path}")
    print(f"[local-llm] Saved env hints: {env_path}")


if __name__ == "__main__":
    main()
