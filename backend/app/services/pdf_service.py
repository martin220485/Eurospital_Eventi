"""PDF: attestato di partecipazione + report evento (reportlab)."""
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

BRAND = HexColor("#2a6695")
ACCENT = HexColor("#3a7fb3")
TEXT = HexColor("#0e2a40")


def attendance_certificate(*, user_full_name: str, event_title: str,
                           event_date: datetime, signature_name: str | None = None) -> bytes:
    """Genera un PDF A4 landscape con bordo decorativo + dati partecipazione."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A4))
    width, height = landscape(A4)

    # Cornice
    c.setStrokeColor(BRAND)
    c.setLineWidth(3)
    c.rect(1 * cm, 1 * cm, width - 2 * cm, height - 2 * cm)
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1)
    c.rect(1.5 * cm, 1.5 * cm, width - 3 * cm, height - 3 * cm)

    # Header
    c.setFillColor(BRAND)
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(width / 2, height - 4 * cm, "Attestato di Partecipazione")

    c.setFillColor(TEXT)
    c.setFont("Helvetica", 13)
    c.drawCentredString(width / 2, height - 5.2 * cm, "Eurospital S.p.A.")

    # Body
    c.setFont("Helvetica", 14)
    c.drawCentredString(width / 2, height / 2 + 2 * cm, "Si attesta che")

    c.setFillColor(BRAND)
    c.setFont("Helvetica-Bold", 24)
    c.drawCentredString(width / 2, height / 2 + 0.5 * cm, user_full_name or "—")

    c.setFillColor(TEXT)
    c.setFont("Helvetica", 13)
    c.drawCentredString(width / 2, height / 2 - 1 * cm, "ha partecipato all'evento")

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, height / 2 - 2.2 * cm, event_title)

    c.setFont("Helvetica", 12)
    c.drawCentredString(
        width / 2, height / 2 - 3.3 * cm,
        f"tenuto in data {event_date.strftime('%d/%m/%Y')}",
    )

    # Footer / firma
    if signature_name:
        c.setFont("Helvetica-Oblique", 11)
        c.drawString(width - 8 * cm, 3.2 * cm, signature_name)
        c.line(width - 8 * cm, 3 * cm, width - 2 * cm, 3 * cm)
        c.setFont("Helvetica", 9)
        c.drawString(width - 8 * cm, 2.6 * cm, "Direzione Risorse Umane")

    c.setFont("Helvetica", 8)
    c.setFillColor(colors.gray)
    c.drawString(2 * cm, 2 * cm, f"Rilasciato il {datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')}")

    c.showPage()
    c.save()
    return buf.getvalue()


def event_report_pdf(*, event_title: str, event_start: datetime,
                     event_end: datetime | None, capacity: int | None,
                     status: str, counts: dict, attendance_rate: float,
                     custom_fields_summary: list) -> bytes:
    """Genera un PDF A4 con report evento (KPI + breakdown campi custom)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("title", parent=styles["Title"], textColor=BRAND, fontSize=18)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=BRAND, fontSize=13)
    body = styles["BodyText"]

    story = []
    story.append(Paragraph("Report evento", title))
    story.append(Paragraph(event_title, h2))
    when = event_start.strftime("%d/%m/%Y %H:%M")
    if event_end:
        when += f" → {event_end.strftime('%d/%m/%Y %H:%M')}"
    story.append(Paragraph(when, body))
    story.append(Paragraph(f"Stato: <b>{status}</b> · Capienza: <b>{capacity if capacity is not None else '∞'}</b>", body))
    story.append(Spacer(1, 0.5 * cm))

    # Counts table
    rows = [
        ["Stato", "Conteggio"],
        ["Confermati", counts.get("confirmed", 0)],
        ["In attesa", counts.get("waitlisted", 0)],
        ["Annullati", counts.get("cancelled", 0)],
        ["Presenti", counts.get("attended", 0)],
        ["No-show", counts.get("no_show", 0)],
        ["Pending", counts.get("pending", 0)],
    ]
    t = Table(rows, colWidths=[8 * cm, 4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph(
        f"<b>Tasso di partecipazione:</b> {round(attendance_rate * 100)}%",
        body,
    ))
    story.append(Spacer(1, 0.5 * cm))

    # Custom fields summary
    if custom_fields_summary:
        story.append(Paragraph("Campi custom", h2))
        for f in custom_fields_summary:
            story.append(Spacer(1, 0.2 * cm))
            story.append(Paragraph(f"<b>{f['label']}</b> <font size=8 color='grey'>{f['type']}</font>", body))
            if f["options"]:
                sub = [["Valore", "Conteggio"]] + [[o["value"] or "(vuoto)", o["count"]] for o in f["options"]]
                st = Table(sub, colWidths=[10 * cm, 4 * cm])
                st.setStyle(TableStyle([
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ]))
                story.append(st)

    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph(
        f"<font size=8 color='grey'>Generato il {datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')}</font>",
        body,
    ))

    doc.build(story)
    return buf.getvalue()
