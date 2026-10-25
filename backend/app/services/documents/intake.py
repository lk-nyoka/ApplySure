"""Validation and malware scanning for uploaded files. Files are held in memory only and never stored."""
import socket
import struct

_SIGNATURES = (("application/pdf", b"%PDF-"), ("image/png", b"\x89PNG\r\n\x1a\n"), ("image/jpeg", b"\xff\xd8\xff"))


class RejectedFile(Exception):
    """The file must not be processed. The message is safe to show the applicant."""


class ScannerUnavailable(Exception):
    pass


def sniff_type(data: bytes, max_bytes: int) -> str:
    """Return the real content type from the file's leading bytes, ignoring its name and declared type."""
    if not data:
        raise RejectedFile("The file is empty.")
    if len(data) > max_bytes:
        raise RejectedFile(f"Files must be {max_bytes // (1024 * 1024)} MB or smaller.")
    for content_type, signature in _SIGNATURES:
        if data.startswith(signature):
            return content_type
    raise RejectedFile("Only PDF, JPG and PNG files are accepted.")


def clamav_scan(data: bytes, host: str, port: int, timeout: float = 30) -> None:
    """Stream the bytes to clamd (INSTREAM). Raises RejectedFile if malware is found and
    ScannerUnavailable if the scanner cannot give a clear answer, so callers fail closed."""
    try:
        with socket.create_connection((host, port), timeout=timeout) as connection:
            connection.sendall(b"zINSTREAM\0")
            for start in range(0, len(data), 64 * 1024):
                chunk = data[start : start + 64 * 1024]
                connection.sendall(struct.pack("!I", len(chunk)) + chunk)
            connection.sendall(struct.pack("!I", 0))
            reply = connection.recv(4096).rstrip(b"\0").decode("utf-8", errors="replace")
    except OSError as exc:
        raise ScannerUnavailable("Malware scanner is unreachable") from exc
    if reply.endswith("FOUND"):
        raise RejectedFile("This file was flagged by the malware scanner.")
    if not reply.endswith("OK"):
        raise ScannerUnavailable("Malware scanner returned an unexpected reply")


def check_upload(data: bytes, settings) -> str:
    """Validate then scan one upload; returns its real content type."""
    content_type = sniff_type(data, settings.max_upload_mb * 1024 * 1024)
    if settings.clamav_host:
        clamav_scan(data, settings.clamav_host, settings.clamav_port)
    elif not settings.allow_unscanned_uploads:
        raise ScannerUnavailable("No malware scanner is configured")
    return content_type
