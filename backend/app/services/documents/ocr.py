"""Optical character recognition for photos and scanned PDFs, with RapidOCR (offline, CPU only).

OCR runs in one long-lived worker process so the model loads once, and a read that runs past its
time limit gets the worker killed and replaced. If RapidOCR is not installed, `available()` is False
and callers treat images as unreadable, exactly as before OCR existed.
"""
import io
import threading
from concurrent.futures import ProcessPoolExecutor, TimeoutError as FutureTimeout
from importlib.util import find_spec
from multiprocessing import get_context

from .intake import RejectedFile

MAX_PIXELS = 40_000_000  # refuse decompression bombs: a real phone photo is ~12 megapixels
MAX_SIDE = 2000  # larger photos are scaled down first: same accuracy for documents, much faster
MAX_PDF_IMAGES = 3

_engine = None  # one per worker process
_pool: ProcessPoolExecutor | None = None
_lock = threading.Lock()


def available() -> bool:
    return find_spec("rapidocr_onnxruntime") is not None and find_spec("PIL") is not None


def _prepare(data: bytes) -> bytes:
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with Image.open(io.BytesIO(data)) as image:
            image = image.convert("RGB")
            image.thumbnail((MAX_SIDE, MAX_SIDE))
            out = io.BytesIO()
            image.save(out, "PNG")
            return out.getvalue()
    except Image.DecompressionBombError as exc:
        raise RejectedFile("This image is too large to read. Take a smaller photo and try again.") from exc
    except OSError as exc:
        raise RejectedFile("We couldn't open this image. It may be damaged.") from exc


def _read_images(images: list[bytes]) -> str:
    """Runs inside the worker process."""
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR

        _engine = RapidOCR()
    lines = []
    for data in images:
        result, _ = _engine(_prepare(data))
        lines += [text for _box, text, _score in result or []]
    return "\n".join(lines)


def _get_pool() -> ProcessPoolExecutor:
    global _pool
    with _lock:
        if _pool is None:
            _pool = ProcessPoolExecutor(max_workers=1, mp_context=get_context("spawn"))
        return _pool


def _reset_pool() -> None:
    global _pool
    with _lock:
        if _pool is not None:
            for process in list(getattr(_pool, "_processes", {}).values()):
                process.kill()
            _pool.shutdown(wait=False, cancel_futures=True)
            _pool = None


def read_text(images: list[bytes], timeout: float = 60) -> str:
    """OCR text of one or more images, joined by line. Raises RejectedFile on a bad image or timeout."""
    future = _get_pool().submit(_read_images, images)
    try:
        return future.result(timeout=timeout)
    except FutureTimeout as exc:
        _reset_pool()
        raise RejectedFile("Reading this image took too long. Try a clearer, smaller photo.") from exc
    except RejectedFile:
        raise
    except Exception as exc:  # the worker crashed (e.g. out of memory): start a fresh one next time
        _reset_pool()
        raise RejectedFile("We couldn't read this image.") from exc


def pdf_page_images(data: bytes) -> list[bytes]:
    """The embedded images of a scanned PDF's first pages, which is where a scan's text lives."""
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        images = []
        for page in reader.pages[:MAX_PDF_IMAGES]:
            images += [image.data for image in page.images[:1]]
        return images[:MAX_PDF_IMAGES]
    except Exception:
        return []
