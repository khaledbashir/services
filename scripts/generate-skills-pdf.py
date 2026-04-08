#!/usr/bin/env python3
"""
Generate a professional PDF document explaining Twenty CRM AI Skills for ANC Sports.
"""

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, KeepTogether, HRFlowable
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics import renderPDF

# ── Brand Colors ──
ANC_BLUE = HexColor("#1a365d")
ANC_BLUE_LIGHT = HexColor("#2b6cb0")
ANC_BLUE_PALE = HexColor("#ebf4ff")
ANC_GRAY = HexColor("#4a5568")
ANC_GRAY_LIGHT = HexColor("#e2e8f0")
ANC_GREEN = HexColor("#276749")
ANC_GREEN_LIGHT = HexColor("#c6f6d5")
ANC_ORANGE = HexColor("#c05621")
ANC_ORANGE_LIGHT = HexColor("#feebc8")
ANC_RED = HexColor("#c53030")
SECTION_BG = HexColor("#f7fafc")
WHITE = white


def build_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        "CoverTitle", parent=styles["Title"],
        fontSize=36, leading=44, textColor=white,
        fontName="Helvetica-Bold", alignment=TA_LEFT,
        spaceAfter=12
    ))
    styles.add(ParagraphStyle(
        "CoverSubtitle", parent=styles["Normal"],
        fontSize=16, leading=22, textColor=HexColor("#bee3f8"),
        fontName="Helvetica", alignment=TA_LEFT,
        spaceAfter=8
    ))
    styles.add(ParagraphStyle(
        "CoverMeta", parent=styles["Normal"],
        fontSize=11, leading=16, textColor=HexColor("#90cdf4"),
        fontName="Helvetica", alignment=TA_LEFT,
    ))
    styles.add(ParagraphStyle(
        "SectionHeader", parent=styles["Heading1"],
        fontSize=22, leading=28, textColor=ANC_BLUE,
        fontName="Helvetica-Bold", spaceBefore=24, spaceAfter=12,
        borderPadding=(0, 0, 4, 0)
    ))
    styles.add(ParagraphStyle(
        "SubHeader", parent=styles["Heading2"],
        fontSize=14, leading=18, textColor=ANC_BLUE_LIGHT,
        fontName="Helvetica-Bold", spaceBefore=16, spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        "SkillName", parent=styles["Heading2"],
        fontSize=15, leading=20, textColor=ANC_BLUE,
        fontName="Helvetica-Bold", spaceBefore=12, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "ANCBody", parent=styles["Normal"],
        fontSize=10, leading=15, textColor=ANC_GRAY,
        fontName="Helvetica", alignment=TA_JUSTIFY,
        spaceAfter=8
    ))
    styles.add(ParagraphStyle(
        "BodyBold", parent=styles["Normal"],
        fontSize=10, leading=15, textColor=black,
        fontName="Helvetica-Bold", spaceAfter=4
    ))
    styles.add(ParagraphStyle(
        "ANCBullet", parent=styles["Normal"],
        fontSize=10, leading=15, textColor=ANC_GRAY,
        fontName="Helvetica", leftIndent=18,
        bulletIndent=6, spaceAfter=3,
        bulletFontName="Helvetica", bulletFontSize=10,
    ))
    styles.add(ParagraphStyle(
        "QuoteText", parent=styles["Normal"],
        fontSize=10, leading=15, textColor=ANC_BLUE_LIGHT,
        fontName="Helvetica-Oblique", leftIndent=20,
        borderPadding=(8, 12, 8, 12), spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        "Footer", parent=styles["Normal"],
        fontSize=8, leading=10, textColor=ANC_GRAY,
        fontName="Helvetica", alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        "TableHeader", parent=styles["Normal"],
        fontSize=9, leading=12, textColor=white,
        fontName="Helvetica-Bold", alignment=TA_LEFT,
    ))
    styles.add(ParagraphStyle(
        "TableCell", parent=styles["Normal"],
        fontSize=9, leading=13, textColor=ANC_GRAY,
        fontName="Helvetica", alignment=TA_LEFT,
    ))
    styles.add(ParagraphStyle(
        "TableCellBold", parent=styles["Normal"],
        fontSize=9, leading=13, textColor=black,
        fontName="Helvetica-Bold", alignment=TA_LEFT,
    ))
    styles.add(ParagraphStyle(
        "SmallMuted", parent=styles["Normal"],
        fontSize=8, leading=11, textColor=HexColor("#a0aec0"),
        fontName="Helvetica",
    ))
    return styles


def make_colored_box(text, bg_color, text_color, width=None):
    """Create a colored badge/pill."""
    style = ParagraphStyle("badge", fontSize=8, leading=11, textColor=text_color,
                           fontName="Helvetica-Bold", alignment=TA_CENTER)
    p = Paragraph(text, style)
    t = Table([[p]], colWidths=[width or 1.2*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg_color),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    return t


def make_skill_table(headers, rows, col_widths):
    """Create a styled table for skill details."""
    header_style = ParagraphStyle("th", fontSize=9, leading=12, textColor=white,
                                   fontName="Helvetica-Bold")
    cell_style = ParagraphStyle("td", fontSize=9, leading=13, textColor=ANC_GRAY,
                                 fontName="Helvetica")
    bold_style = ParagraphStyle("tdb", fontSize=9, leading=13, textColor=black,
                                 fontName="Helvetica-Bold")

    data = [[Paragraph(h, header_style) for h in headers]]
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            s = bold_style if i == 0 else cell_style
            cells.append(Paragraph(str(cell), s))
        data.append(cells)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), ANC_BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, ANC_GRAY_LIGHT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]
    # Alternate row colors
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), ANC_BLUE_PALE))

    t.setStyle(TableStyle(style_cmds))
    return t


def draw_cover_page(canvas, doc):
    """Draw the cover page background."""
    w, h = letter
    # Full blue background
    canvas.setFillColor(ANC_BLUE)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)

    # Decorative gradient overlay (lighter strip at top)
    canvas.setFillColor(HexColor("#2a4a7f"))
    canvas.rect(0, h - 3*inch, w, 3*inch, fill=1, stroke=0)

    # Geometric accent lines
    canvas.setStrokeColor(HexColor("#ffffff20"))
    canvas.setLineWidth(0.5)
    for y_offset in range(0, int(h), 40):
        canvas.line(0, y_offset, w * 0.3, y_offset)

    # ANC Logo
    logo_path = "/root/anc-services/public/ANC_Logo_2023_white.png"
    if os.path.exists(logo_path):
        canvas.drawImage(logo_path, 0.75*inch, h - 1.3*inch, width=1.8*inch,
                         height=0.7*inch, preserveAspectRatio=True, mask="auto")

    # Bottom accent bar
    canvas.setFillColor(HexColor("#3182ce"))
    canvas.rect(0, 0, w, 0.4*inch, fill=1, stroke=0)

    # Bottom text
    canvas.setFillColor(HexColor("#90cdf4"))
    canvas.setFont("Helvetica", 9)
    canvas.drawString(0.75*inch, 0.15*inch, "CONFIDENTIAL  |  ANC Sports  |  April 2026")


def draw_page_frame(canvas, doc):
    """Draw header/footer on content pages."""
    w, h = letter
    # Top bar
    canvas.setFillColor(ANC_BLUE)
    canvas.rect(0, h - 0.5*inch, w, 0.5*inch, fill=1, stroke=0)

    # Logo in header
    logo_path = "/root/anc-services/public/ANC_Logo_2023_white.png"
    if os.path.exists(logo_path):
        canvas.drawImage(logo_path, 0.5*inch, h - 0.42*inch, width=1*inch,
                         height=0.3*inch, preserveAspectRatio=True, mask="auto")

    # Header text
    canvas.setFillColor(HexColor("#bee3f8"))
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(w - 0.5*inch, h - 0.35*inch, "Twenty CRM AI Skills Guide")

    # Bottom line
    canvas.setStrokeColor(ANC_GRAY_LIGHT)
    canvas.setLineWidth(0.5)
    canvas.line(0.5*inch, 0.5*inch, w - 0.5*inch, 0.5*inch)

    # Page number
    canvas.setFillColor(ANC_GRAY)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(w / 2, 0.3*inch, f"Page {doc.page}")


def build_pdf():
    output_path = "/root/anc-services/public/uploads/ANC-Twenty-CRM-Skills-Guide.pdf"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        topMargin=0.8*inch,
        bottomMargin=0.7*inch,
        leftMargin=0.65*inch,
        rightMargin=0.65*inch,
        title="ANC Twenty CRM — AI Skills Guide",
        author="Ahmad Basheer",
    )

    styles = build_styles()
    story = []
    W = doc.width  # usable width

    # ════════════════════════════════════════════
    # COVER PAGE
    # ════════════════════════════════════════════
    story.append(Spacer(1, 2.2*inch))
    story.append(Paragraph("Twenty CRM", styles["CoverTitle"]))
    story.append(Paragraph("AI Skills Guide", ParagraphStyle(
        "CoverTitle2", parent=styles["CoverTitle"], fontSize=32, leading=40,
        textColor=HexColor("#63b3ed")
    )))
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph(
        "15 custom AI skills that unify RFP analysis, estimation, proposals, "
        "operations, ticketing, and staffing under one platform.",
        styles["CoverSubtitle"]
    ))
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("Prepared for ANC Sports Leadership", styles["CoverMeta"]))
    story.append(Paragraph("Joe Occhipinti  |  Nick Delia  |  Gianni Strano  |  Chris DeBernardis", styles["CoverMeta"]))
    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph("April 2026  |  Version 1.0", styles["CoverMeta"]))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # TABLE OF CONTENTS
    # ════════════════════════════════════════════
    story.append(Paragraph("Contents", styles["SectionHeader"]))
    story.append(HRFlowable(width="100%", thickness=1, color=ANC_BLUE, spaceAfter=12))

    toc_items = [
        ("1", "Why One Platform", "Replacing Salesforce, Wrike, and Airtable with Twenty CRM"),
        ("2", "What Are AI Skills?", "How skills work inside Twenty CRM"),
        ("3", "Operations Skills", "7 skills for daily ops, staffing, tickets, contracts"),
        ("4", "Proposal Engine Skills", "7 skills connecting CRM to RFP analysis and estimation"),
        ("5", "ANC Copilot", "General-purpose assistant with full ANC context"),
        ("6", "Skill Reference Table", "Complete inventory with triggers and examples"),
        ("7", "Architecture Diagram", "How all systems connect through Twenty CRM"),
        ("8", "Getting Started", "How to use skills today"),
    ]

    toc_data = []
    for num, title, desc in toc_items:
        toc_data.append([
            Paragraph(f"<b>{num}</b>", ParagraphStyle("tocnum", fontSize=12, textColor=ANC_BLUE_LIGHT, fontName="Helvetica-Bold")),
            Paragraph(f"<b>{title}</b><br/><font size=8 color='#718096'>{desc}</font>",
                       ParagraphStyle("toctext", fontSize=11, leading=16, textColor=ANC_BLUE, fontName="Helvetica-Bold")),
        ])
    toc_table = Table(toc_data, colWidths=[0.4*inch, W - 0.6*inch])
    toc_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, ANC_GRAY_LIGHT),
    ]))
    story.append(toc_table)
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # SECTION 1: WHY ONE PLATFORM
    # ════════════════════════════════════════════
    story.append(Paragraph("1 &nbsp; Why One Platform", styles["SectionHeader"]))
    story.append(HRFlowable(width="100%", thickness=1, color=ANC_BLUE, spaceAfter=12))

    story.append(Paragraph(
        "ANC Sports currently relies on multiple disconnected tools to run operations. "
        "Salesforce manages contacts and deals. Wrike handles task assignments. Airtable stores "
        "structured operational data. Google Calendar tracks events. Excel and SharePoint hold "
        "staff lists and reports. Each tool has its own login, its own data silo, and its own "
        "way of doing things.",
        styles["ANCBody"]
    ))
    story.append(Paragraph(
        "<b>Twenty CRM replaces all of them.</b> It's a single self-hosted platform where "
        "every piece of ANC's business lives together: companies, venues, deals, events, "
        "tickets, tasks, staff, and contracted services. When data lives in one place, "
        "the AI can connect dots that humans would miss.",
        styles["ANCBody"]
    ))

    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph("What Gets Replaced", styles["SubHeader"]))

    replace_data = [
        ["Salesforce", "CRM, contacts, deals, pipeline", "Companies + People + Opportunities"],
        ["Wrike", "Task management, project boards", "Tasks with kanban views + filtering"],
        ["Airtable", "Venues, services, schedules", "Venues + Services + custom fields"],
        ["Google Calendar", "Event scheduling", "VenueEvents (direct event feed)"],
        ["Excel / SharePoint", "Staff lists, reports", "Technicians + AI-generated reports"],
    ]
    story.append(make_skill_table(
        ["Old Tool", "What It Did", "Twenty CRM Replacement"],
        replace_data,
        [1.2*inch, 2.2*inch, W - 3.6*inch]
    ))

    story.append(Spacer(1, 0.2*inch))
    # Key benefit callout box
    callout_data = [[Paragraph(
        '<b>The key insight:</b> When your CRM knows about venues, events, tickets, staff, AND deals, '
        'the AI can answer questions like <i>"Which venues have expiring contracts AND rising ticket counts?"</i> '
        'or <i>"Show me unstaffed events this week at venues with active maintenance contracts."</i> '
        'No single old tool could answer those cross-domain questions.',
        ParagraphStyle("callout", fontSize=10, leading=15, textColor=ANC_BLUE, fontName="Helvetica")
    )]]
    callout = Table(callout_data, colWidths=[W - 0.3*inch])
    callout.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ANC_BLUE_PALE),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
    ]))
    story.append(callout)
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # SECTION 2: WHAT ARE AI SKILLS
    # ════════════════════════════════════════════
    story.append(Paragraph("2 &nbsp; What Are AI Skills?", styles["SectionHeader"]))
    story.append(HRFlowable(width="100%", thickness=1, color=ANC_BLUE, spaceAfter=12))

    story.append(Paragraph(
        "Twenty CRM has a built-in AI assistant (the chat icon in the bottom-right corner). "
        "You can ask it questions, and it will query your CRM data to find answers. "
        "<b>Skills</b> are expert playbooks that teach the AI how to handle specific types "
        "of requests with domain knowledge it wouldn't otherwise have.",
        styles["ANCBody"]
    ))
    story.append(Paragraph(
        "Think of skills like giving a new hire a detailed procedure manual. The AI already "
        "knows how to read and write CRM data. Skills tell it <i>what</i> to look for, "
        "<i>how</i> to combine data from multiple objects, and <i>what format</i> to present "
        "results in. Skills can also call external APIs — like the Proposal Engine — to "
        "perform actions that go beyond the CRM itself.",
        styles["ANCBody"]
    ))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("How to Use a Skill", styles["SubHeader"]))

    steps = [
        "<b>Open the AI chat</b> in Twenty CRM (bottom-right chat icon)",
        "<b>Ask a natural question</b> — the AI automatically loads the right skill",
        "<b>Get structured results</b> — tables, summaries, action items, not raw data dumps",
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(
            f"<b>{i}.</b> &nbsp; {step}",
            ParagraphStyle("step", parent=styles["ANCBody"], leftIndent=12, spaceAfter=6)
        ))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("Example Prompts", styles["SubHeader"]))

    examples = [
        ('"How\'s Prudential doing?"', "Venue Health Report", "Full venue status with tickets, events, staff, services"),
        ('"Any unstaffed events this week?"', "Event Staffing Assistant", "Lists events needing tech assignments"),
        ('"Estimate a 20x40 outdoor LED"', "Quick Estimator", "Calls Proposal Engine, returns real pricing"),
        ('"Pipeline status"', "Pipeline Tracker", "Deals by stage, stuck opportunities, win rates"),
        ('"New RFP from MetLife"', "RFP-to-Deal Pipeline", "End-to-end: analyze, estimate, create opportunity"),
    ]

    story.append(make_skill_table(
        ["You Say...", "Skill Activated", "What Happens"],
        examples,
        [2*inch, 1.6*inch, W - 3.8*inch]
    ))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # SECTION 3: OPERATIONS SKILLS
    # ════════════════════════════════════════════
    story.append(Paragraph("3 &nbsp; Operations Skills", styles["SectionHeader"]))
    story.append(HRFlowable(width="100%", thickness=1, color=ANC_BLUE, spaceAfter=12))

    story.append(Paragraph(
        "These 7 skills handle day-to-day operations: venue monitoring, event staffing, "
        "ticket management, task tracking, and contract oversight. They work entirely within "
        "Twenty CRM's data — no external API calls needed.",
        styles["ANCBody"]
    ))

    ops_skills = [
        {
            "name": "Venue Health Report",
            "icon": "IconBuilding",
            "who": "Joe, Nick",
            "desc": "Generates a comprehensive status report for any venue. Pulls open tickets, upcoming events, "
                    "assigned staff, active services, and contract dates into one view. Flags staffing gaps, "
                    "expiring services, and high-priority tickets automatically.",
            "triggers": ['"How\'s Prudential?"', '"Venue status for TD Garden"', '"What\'s going on at Fenway?"'],
            "output": "Venue name, company, staff roster, service table, ticket summary, event list, flag alerts"
        },
        {
            "name": "Event Staffing Assistant",
            "icon": "IconUsers",
            "who": "Nick, Gianni",
            "desc": "Finds events that need technician assignments, checks who's available by venue and region, "
                    "and suggests the best techs to assign. Prioritizes home-venue staff first, then same-region, "
                    "then flags when travel is needed.",
            "triggers": ['"Unstaffed events this week"', '"Who\'s working the Celtics game?"', '"Staff availability Northeast"'],
            "output": "Unstaffed event list with suggested techs, availability matrix, urgency flags"
        },
        {
            "name": "Ops Daily Digest",
            "icon": "IconCalendarEvent",
            "who": "Joe",
            "desc": "Morning briefing that pulls everything relevant for the day: urgent tickets, today's events, "
                    "overdue tasks, staffing gaps, and the week ahead. Designed to be scannable in under 60 seconds.",
            "triggers": ['"Morning briefing"', '"What\'s happening today?"', '"Daily digest"'],
            "output": "Urgent items first, then today's events, ticket summary, overdue tasks, week ahead calendar"
        },
        {
            "name": "Ticket Triage",
            "icon": "IconTicket",
            "who": "Chris",
            "desc": "Automatically categorizes incoming tickets by type (hardware/software/general), suggests "
                    "priority based on impact, recommends the right technician, and finds similar past tickets "
                    "at the same venue for diagnostic clues.",
            "triggers": ['"New ticket at Prudential"', '"Categorize this issue"', '"Ticket trends"'],
            "output": "Category, priority recommendation, suggested assignee, similar past tickets"
        },
        {
            "name": "Pipeline Tracker",
            "icon": "IconChartBar",
            "who": "Jireh, Natalia",
            "desc": "Analyzes the full sales pipeline: deals by stage, total value per stage, stuck opportunities "
                    "(no activity in 30+ days), expiring client contracts, and win/loss rates by quarter.",
            "triggers": ['"Pipeline status"', '"Stuck deals"', '"Win rate"', '"Expiring contracts"'],
            "output": "Pipeline summary table, stuck deal alerts, contract renewal list, win rate calculation"
        },
        {
            "name": "Contract & Revenue Tracker",
            "icon": "IconFileInvoice",
            "who": "Joe, Jireh",
            "desc": "Monitors contract expirations across all clients, calculates monthly recurring revenue from "
                    "active services, identifies coverage gaps where venues have no active services, and flags "
                    "revenue at risk from expiring contracts.",
            "triggers": ['"Revenue at risk"', '"MRR"', '"Service coverage"', '"Expiring contracts"'],
            "output": "Revenue summary, expiration timeline (color-coded), service coverage map, MRR breakdown"
        },
        {
            "name": "Venue Onboarding",
            "icon": "IconChecklist",
            "who": "Nick, Gianni",
            "desc": "When a deal is won, automatically generates 20+ tasks across 4 phases: pre-install, "
                    "procurement, installation, and go-live. Each task gets proper type, category, priority, "
                    "and estimated timeline based on deal size.",
            "triggers": ['"Won the Panthers deal — set up onboarding"', '"New venue setup for MetLife"'],
            "output": "20+ tasks created in Twenty with proper categorization, linked to venue and company"
        },
    ]

    for skill in ops_skills:
        story.append(KeepTogether([
            Paragraph(f'{skill["name"]}', styles["SkillName"]),
            Paragraph(f'<font color="#718096">Primary users: {skill["who"]}</font>', styles["SmallMuted"]),
            Spacer(1, 4),
            Paragraph(skill["desc"], styles["ANCBody"]),
            Paragraph("<b>Example prompts:</b>", ParagraphStyle("bl", parent=styles["ANCBody"], fontSize=9, spaceAfter=2)),
            Paragraph(
                " &nbsp;&bull;&nbsp; ".join(f'<font color="#2b6cb0">{t}</font>' for t in skill["triggers"]),
                ParagraphStyle("triggers", parent=styles["ANCBody"], fontSize=9, textColor=ANC_BLUE_LIGHT, leftIndent=12)
            ),
            Spacer(1, 2),
            Paragraph(f'<b>Output:</b> {skill["output"]}',
                       ParagraphStyle("out", parent=styles["ANCBody"], fontSize=9)),
            HRFlowable(width="100%", thickness=0.5, color=ANC_GRAY_LIGHT, spaceBefore=8, spaceAfter=4),
        ]))

    story.append(PageBreak())

    # ════════════════════════════════════════════
    # SECTION 4: PROPOSAL ENGINE SKILLS
    # ════════════════════════════════════════════
    story.append(Paragraph("4 &nbsp; Proposal Engine Integration Skills", styles["SectionHeader"]))
    story.append(HRFlowable(width="100%", thickness=1, color=ANC_BLUE, spaceAfter=12))

    story.append(Paragraph(
        "These 7 skills connect Twenty CRM to the <b>Proposal Engine</b> at proposals.anc.com. "
        "They use the AI's Code Interpreter to call the Proposal Engine's REST API, bringing "
        "RFP analysis, cost estimation, product matching, and document generation directly "
        "into the CRM chat interface.",
        styles["ANCBody"]
    ))

    # Architecture callout
    arch_data = [[Paragraph(
        '<b>How it works:</b> When you ask the AI to estimate a project, it loads the Quick Estimator skill, '
        'which tells it to use the Code Interpreter (Python) to call <font face="Courier">proposals.anc.com/api/estimator/ai-quick</font>. '
        'The Proposal Engine does the heavy lifting — product matching, cost calculation, margin analysis — and '
        'returns structured results that the AI formats into a readable report. The CRM never leaves your screen.',
        ParagraphStyle("arch", fontSize=10, leading=15, textColor=ANC_GREEN, fontName="Helvetica")
    )]]
    arch_box = Table(arch_data, colWidths=[W - 0.3*inch])
    arch_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ANC_GREEN_LIGHT),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
    ]))
    story.append(arch_box)
    story.append(Spacer(1, 0.15*inch))

    pe_skills = [
        {
            "name": "RFP Analyzer",
            "icon": "IconFileSearch",
            "who": "Natalia, Matt",
            "desc": "Pulls completed RFP analysis results from the Proposal Engine into the CRM. Shows extracted "
                    "LED display specifications (sizes, pixel pitch, environment), creates or links to Company and "
                    "Venue records, and generates an Opportunity with all specs pre-filled.",
            "triggers": ['"What RFPs have been analyzed?"', '"Pull RFP results for Prudential"', '"Create opportunity from the MetLife RFP"'],
            "api": "GET /api/rfp/analyses, GET /api/rfp/analyses/{id}"
        },
        {
            "name": "Quick Estimator",
            "icon": "IconCalculator",
            "who": "Natalia, Matt, Jeremy",
            "desc": "Get instant cost estimates from natural language. Describe a project in plain English and the "
                    "AI calls the Proposal Engine's estimator to extract display specs, match products from the "
                    "catalog, and return rough pricing with hardware, structure, and installation breakdowns.",
            "triggers": ['"How much for a 20x40 outdoor LED?"', '"Estimate: 3 displays, 10mm, indoor arena"', '"Price out a scoreboard for BofA Stadium"'],
            "api": "POST /api/estimator/ai-quick, GET /api/agent-skill/products"
        },
        {
            "name": "Proposal Generator",
            "icon": "IconFileText",
            "who": "Natalia",
            "desc": "Creates full proposals, budgets, and letters of intent from CRM Opportunity data. Pulls client, "
                    "venue, and deal info from the CRM, sends it to the Proposal Engine, and returns links to "
                    "editable proposals, downloadable PDFs, and Excel workbooks. Automatically updates the "
                    "Opportunity with the proposal URL.",
            "triggers": ['"Create a proposal for the Panthers deal"', '"Generate a budget for Prudential"', '"Make an LOI for the MetLife expansion"'],
            "api": "POST /api/agent-skill/create-proposal, POST /api/agent-skill/generate-excel"
        },
        {
            "name": "LED Product Catalog",
            "icon": "IconDeviceTv",
            "who": "Matt, Jeremy, Natalia",
            "desc": "Searches ANC's LED product database by pixel pitch, environment (indoor/outdoor), manufacturer, "
                    "and brightness. Returns product specs with pricing per square foot. Includes a pixel pitch "
                    "guide for recommending the right product based on viewing distance.",
            "triggers": ['"What outdoor panels do we carry?"', '"10mm options from Yaham"', '"Best product for indoor arena, 30ft viewing distance"'],
            "api": "GET /api/agent-skill/products"
        },
        {
            "name": "SOW & Document Generator",
            "icon": "IconFileDescription",
            "who": "Natalia, Matt",
            "desc": "Generates professional documents from CRM data: installation Scope of Work (Word), spec sheets "
                    "(PDF), bid response forms, scoping workbooks (multi-sheet Excel), and subcontractor quote "
                    "templates for electrical, structural, and LED suppliers.",
            "triggers": ['"Generate a SOW for the BofA install"', '"Create spec sheet"', '"Fill the bid form for this RFP"', '"Scoping workbook for Panthers"'],
            "api": "POST /api/sow/generate-installation, POST /api/rfp/pipeline/fill-bid-form"
        },
        {
            "name": "RFP-to-Deal Pipeline",
            "icon": "IconArrowRight",
            "who": "Natalia, Jireh",
            "desc": "The end-to-end orchestrator. Takes an analyzed RFP and runs the full pipeline: retrieves "
                    "extracted specs, matches products, creates CRM records (Company + Venue + Opportunity), "
                    "generates a proposal, creates scoping documents, and sets up follow-up tasks. "
                    "One command, seven steps, everything linked.",
            "triggers": ['"New RFP from MetLife — run the full pipeline"', '"Process the Prudential RFP end to end"'],
            "api": "Multiple endpoints orchestrated: /api/rfp/analyses, /api/agent-skill/products, /api/rfp/pipeline/create-proposal"
        },
        {
            "name": "Venue Performance Analytics",
            "icon": "IconChartLine",
            "who": "Joe, Nick",
            "desc": "Generates performance reports by combining CRM data (tickets, events, services, staff) with "
                    "Proposal Engine analytics. Shows ticket trends, staffing rates, service health, and "
                    "resolution times. Can compare venues side-by-side to identify which need attention.",
            "triggers": ['"Performance report for Prudential"', '"Compare TD Garden vs Fenway"', '"Which venues need attention?"'],
            "api": "POST /api/performance/reports/generate + CRM queries"
        },
    ]

    for skill in pe_skills:
        story.append(KeepTogether([
            Paragraph(f'{skill["name"]}', styles["SkillName"]),
            Paragraph(f'<font color="#718096">Primary users: {skill["who"]}</font>', styles["SmallMuted"]),
            Spacer(1, 4),
            Paragraph(skill["desc"], styles["ANCBody"]),
            Paragraph("<b>Example prompts:</b>", ParagraphStyle("bl", parent=styles["ANCBody"], fontSize=9, spaceAfter=2)),
            Paragraph(
                " &nbsp;&bull;&nbsp; ".join(f'<font color="#2b6cb0">{t}</font>' for t in skill["triggers"]),
                ParagraphStyle("triggers", parent=styles["ANCBody"], fontSize=9, textColor=ANC_BLUE_LIGHT, leftIndent=12)
            ),
            Spacer(1, 2),
            Paragraph(f'<font color="#718096" size="8">API: {skill["api"]}</font>',
                       ParagraphStyle("apiref", parent=styles["SmallMuted"], leftIndent=12)),
            HRFlowable(width="100%", thickness=0.5, color=ANC_GRAY_LIGHT, spaceBefore=8, spaceAfter=4),
        ]))

    story.append(PageBreak())

    # ════════════════════════════════════════════
    # SECTION 5: ANC COPILOT
    # ════════════════════════════════════════════
    story.append(Paragraph("5 &nbsp; ANC Operations Copilot", styles["SectionHeader"]))
    story.append(HRFlowable(width="100%", thickness=1, color=ANC_BLUE, spaceAfter=12))

    story.append(Paragraph(
        "The Copilot is a general-purpose assistant that understands ANC's entire business: "
        "team members, organizational structure, data model, connected systems, and workflows. "
        "It acts as the fallback when no specialized skill matches — and it can load other "
        "skills on-the-fly when it recognizes a specific need.",
        styles["ANCBody"]
    ))

    story.append(Paragraph("What it knows:", styles["SubHeader"]))
    knows = [
        "All CRM objects: Companies, Venues, Services, People, Opportunities, Events, Tickets, Tasks, Technicians",
        "ANC team: Joe (COO), Jireh (Sales), Natalia (Proposals), Nick & Gianni (Ops), Chris (Support)",
        "Connected systems: Proposal Engine, Services Dashboard, Slack",
        "Key workflows: sales pipeline, event staffing, ticket resolution, contract lifecycle",
    ]
    for item in knows:
        story.append(Paragraph(f"&bull; &nbsp; {item}", styles["ANCBullet"]))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("Example questions:", styles["SubHeader"]))
    copilot_examples = [
        '"Which venues have the most tickets AND expiring contracts?"',
        '"Who on our team handles the Northeast region?"',
        '"Summarize everything we know about the Panthers account"',
        '"What\'s the total MRR across all active services?"',
        '"How many events did we staff last month?"',
    ]
    for ex in copilot_examples:
        story.append(Paragraph(f"&bull; &nbsp; <font color='#2b6cb0'>{ex}</font>", styles["ANCBullet"]))

    story.append(PageBreak())

    # ════════════════════════════════════════════
    # SECTION 6: COMPLETE REFERENCE TABLE
    # ════════════════════════════════════════════
    story.append(Paragraph("6 &nbsp; Complete Skill Reference", styles["SectionHeader"]))
    story.append(HRFlowable(width="100%", thickness=1, color=ANC_BLUE, spaceAfter=12))

    all_skills = [
        ["Venue Health Report", "Operations", "Joe, Nick", '"How\'s [venue]?"'],
        ["Event Staffing Assistant", "Operations", "Nick, Gianni", '"Unstaffed events?"'],
        ["Ops Daily Digest", "Operations", "Joe", '"Morning briefing"'],
        ["Ticket Triage", "Operations", "Chris", '"New ticket at [venue]"'],
        ["Pipeline Tracker", "Operations", "Jireh, Natalia", '"Pipeline status"'],
        ["Contract & Revenue Tracker", "Operations", "Joe, Jireh", '"Expiring contracts"'],
        ["Venue Onboarding", "Operations", "Nick, Gianni", '"Won the [deal] — onboard"'],
        ["RFP Analyzer", "Proposal Engine", "Natalia, Matt", '"Pull RFP for [project]"'],
        ["Quick Estimator", "Proposal Engine", "Natalia, Matt", '"Estimate a 20x40 LED"'],
        ["Proposal Generator", "Proposal Engine", "Natalia", '"Create proposal for [deal]"'],
        ["LED Product Catalog", "Proposal Engine", "Matt, Jeremy", '"What 10mm panels?"'],
        ["SOW & Doc Generator", "Proposal Engine", "Natalia", '"Generate SOW for [venue]"'],
        ["RFP-to-Deal Pipeline", "Proposal Engine", "Natalia, Jireh", '"Process RFP end to end"'],
        ["Venue Performance", "Proposal Engine", "Joe, Nick", '"Performance at [venue]"'],
        ["ANC Copilot", "General", "Everyone", '"Tell me about [anything]"'],
    ]

    story.append(make_skill_table(
        ["Skill", "Category", "Users", "Trigger Example"],
        all_skills,
        [1.7*inch, 1.2*inch, 1.2*inch, W - 4.3*inch]
    ))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # SECTION 7: ARCHITECTURE
    # ════════════════════════════════════════════
    story.append(Paragraph("7 &nbsp; Architecture: How Everything Connects", styles["SectionHeader"]))
    story.append(HRFlowable(width="100%", thickness=1, color=ANC_BLUE, spaceAfter=12))

    story.append(Paragraph(
        "Twenty CRM sits at the center of three systems. Data flows in from the Services Dashboard "
        "(events, tickets every 15 min) and the Proposal Engine (deals, proposals). The AI skills "
        "can read from all systems and write back to the CRM, creating a unified operational picture.",
        styles["ANCBody"]
    ))

    # System connection table
    conn_data = [
        ["Proposal Engine\nproposals.anc.com", "Twenty CRM", "AI Skills\n(Code Interpreter)", "RFP specs, estimates,\nproposal links"],
        ["Services Dashboard\nanc-services", "Twenty CRM", "Cron Sync\n(every 15 min)", "Events, tickets,\nstaff records"],
        ["Twenty CRM", "Slack\n(#ops, #wins)", "Workflow Webhooks\n(planned)", "Deal wins, overdue tasks,\nhigh-priority tickets"],
        ["Twenty CRM", "Proposal Engine", "Webhook\n(fire-and-forget)", "Opportunity updates,\nbid status changes"],
    ]
    story.append(make_skill_table(
        ["Source", "Target", "Method", "Data Flowing"],
        conn_data,
        [1.5*inch, 1.3*inch, 1.4*inch, W - 4.4*inch]
    ))

    story.append(Spacer(1, 0.2*inch))

    # Data model summary
    story.append(Paragraph("CRM Data Model", styles["SubHeader"]))
    model_data = [
        ["Companies", "53", "Client organizations, teams, manufacturers"],
        ["Venues", "49", "Physical locations with LED equipment"],
        ["Services", "NEW", "Contracted service lines per venue (maintenance, staffing, warranty)"],
        ["People", "7+", "Contacts at companies + ANC team"],
        ["Opportunities", "0*", "Deals and proposals (* to be populated from Proposal Engine)"],
        ["Events", "500+", "Games and concerts (synced from Services Dashboard)"],
        ["Tickets", "680+", "Support issues (synced from Services Dashboard)"],
        ["Tasks", "0*", "Work items replacing Wrike (* to be populated)"],
        ["Technicians", "25", "ANC field staff assigned to venues"],
    ]
    story.append(make_skill_table(
        ["Object", "Records", "Purpose"],
        model_data,
        [1.2*inch, 0.8*inch, W - 2.2*inch]
    ))

    story.append(PageBreak())

    # ════════════════════════════════════════════
    # SECTION 8: GETTING STARTED
    # ════════════════════════════════════════════
    story.append(Paragraph("8 &nbsp; Getting Started", styles["SectionHeader"]))
    story.append(HRFlowable(width="100%", thickness=1, color=ANC_BLUE, spaceAfter=12))

    story.append(Paragraph("Step 1: Open Twenty CRM", styles["SubHeader"]))
    story.append(Paragraph(
        'Navigate to <font color="#2b6cb0"><u>https://abc-twenty.izcgmb.easypanel.host</u></font> '
        'and log in with your workspace credentials.',
        styles["ANCBody"]
    ))

    story.append(Paragraph("Step 2: Open the AI Chat", styles["SubHeader"]))
    story.append(Paragraph(
        "Click the chat icon in the bottom-right corner of any page. This opens the AI assistant "
        "that has access to all 15 custom skills plus the 12 built-in skills.",
        styles["ANCBody"]
    ))

    story.append(Paragraph("Step 3: Ask a Question", styles["SubHeader"]))
    story.append(Paragraph(
        "Type your question in natural language. The AI will automatically select the right skill "
        "based on your intent. You don't need to specify which skill to use — just describe what "
        "you need.",
        styles["ANCBody"]
    ))

    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph("Quick Start Examples by Role", styles["SubHeader"]))

    role_data = [
        ["Joe (COO)", '"Morning briefing"', "Gets the Ops Daily Digest: urgent items, today's events, overdue tasks"],
        ["Nick (Ops)", '"Unstaffed events this week"', "Gets Event Staffing Assistant: events needing techs, available staff"],
        ["Chris (Support)", '"New ticket: screens flickering at Prudential"', "Gets Ticket Triage: priority, suggested tech, similar past tickets"],
        ["Natalia (Proposals)", '"Estimate 4 outdoor displays for MetLife"', "Gets Quick Estimator: specs, product matches, rough pricing"],
        ["Jireh (Sales)", '"Pipeline status"', "Gets Pipeline Tracker: deals by stage, stuck items, win rate"],
    ]
    story.append(make_skill_table(
        ["Role", "Try This", "What You Get"],
        role_data,
        [1.1*inch, 2.3*inch, W - 3.6*inch]
    ))

    story.append(Spacer(1, 0.3*inch))

    # Final callout
    final_data = [[Paragraph(
        '<b>All 15 skills are live and active now.</b> The AI assistant is ready to use — '
        'no setup required on your end. Just open the chat and start asking questions. '
        'Skills will continue to improve as we learn what questions are most common and '
        'which data combinations are most valuable.',
        ParagraphStyle("final", fontSize=11, leading=16, textColor=ANC_BLUE, fontName="Helvetica-Bold")
    )]]
    final_box = Table(final_data, colWidths=[W - 0.3*inch])
    final_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ANC_BLUE_PALE),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
        ("TOPPADDING", (0, 0), (-1, -1), 16),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
        ("LEFTPADDING", (0, 0), (-1, -1), 20),
        ("RIGHTPADDING", (0, 0), (-1, -1), 20),
    ]))
    story.append(final_box)

    # ════════════════════════════════════════════
    # BUILD
    # ════════════════════════════════════════════
    doc.build(
        story,
        onFirstPage=draw_cover_page,
        onLaterPages=draw_page_frame
    )
    print(f"PDF generated: {output_path}")
    print(f"File size: {os.path.getsize(output_path) / 1024:.0f} KB")


if __name__ == "__main__":
    build_pdf()
