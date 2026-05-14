import os
import re
import pdfplumber


MIN_PDF_TEXT_CHARS = int(os.getenv("MIN_PDF_TEXT_CHARS", "500"))
MAX_OCR_PAGES = int(os.getenv("MAX_OCR_PAGES", "5"))
OCR_LANGUAGES = os.getenv("OCR_LANGUAGES", "eng+vie")
OCR_RENDER_SCALE = float(os.getenv("OCR_RENDER_SCALE", "2.0"))
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")


def _clean_text(text: str) -> str:
    text = (text or "").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_embedded_text(file_path: str) -> str:
    chunks = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text(layout=True)
            if page_text:
                chunks.append(page_text)
    return _clean_text("\n".join(chunks))


def _extract_ocr_text(file_path: str) -> str:
    try:
        import fitz
        import pytesseract
        from PIL import Image
    except Exception:
        return ""

    if TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

    chunks = []
    with fitz.open(file_path) as doc:
        for page_index in range(min(len(doc), MAX_OCR_PAGES)):
            page = doc.load_page(page_index)
            matrix = fitz.Matrix(OCR_RENDER_SCALE, OCR_RENDER_SCALE)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            chunks.append(pytesseract.image_to_string(image, lang=OCR_LANGUAGES))
    return _clean_text("\n".join(chunks))


def extract_text_from_pdf(file_path: str) -> str:
    """Extract PDF text, falling back to OCR for scanned/low-text PDFs."""
    embedded_text = _extract_embedded_text(file_path)
    if len(embedded_text) >= MIN_PDF_TEXT_CHARS:
        return embedded_text

    ocr_text = _extract_ocr_text(file_path)
    return ocr_text if len(ocr_text) > len(embedded_text) else embedded_text
