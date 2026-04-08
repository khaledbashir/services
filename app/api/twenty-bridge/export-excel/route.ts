/**
 * GET /api/twenty-bridge/export-excel?estimateId=xxx
 *
 * Generates an ANC-formatted Margin Analysis Excel from a Twenty CRM Estimate.
 * Called by Twenty AI skill — returns a downloadable .xlsx file.
 */

import { NextRequest, NextResponse } from "next/server";

const TWENTY_URL =
  process.env.TWENTY_API_URL || "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_TOKEN = process.env.TWENTY_API_TOKEN || "";

// Dynamic import to avoid build issues if ExcelJS isn't available
async function generateExcel(estimate: any, lines: any[]) {
  // Use openpyxl-style approach with ExcelJS (already in node_modules from Next.js ecosystem)
  // Fallback: build the workbook with a simple XLSX library
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ANC Proposal Engine";
  workbook.created = new Date();

  const ANC_BLUE = "0A52EF";
  const DARK_BG = "1A1A2E";
  const GREEN = "28A745";
  const AMBER = "F39C12";
  const LIGHT_GRAY = "F5F5F5";
  const MARGIN_GREEN = "27AE60";

  const toUsd = (micros: number) =>
    micros ? Math.round(micros / 1_000_000) : 0;

  // ── Sheet 1: Executive Summary ──
  const ws1 = workbook.addWorksheet("Executive Summary", {
    properties: { tabColor: { argb: `FF${ANC_BLUE}` } },
  });

  ws1.columns = [
    { width: 38 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 15 },
  ];

  // Title
  ws1.mergeCells("A1:E1");
  const titleCell = ws1.getCell("A1");
  titleCell.value = "ANC — MARGIN ANALYSIS";
  titleCell.font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ANC_BLUE}` } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(1).height = 45;

  // Subtitle
  ws1.mergeCells("A2:E2");
  const subCell = ws1.getCell("A2");
  subCell.value = `${estimate.projectName || estimate.name} — Budget Estimate`;
  subCell.font = { name: "Calibri", size: 12, color: { argb: "FFFFFFFF" } };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${DARK_BG}` } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(2).height = 30;

  // Date
  ws1.mergeCells("A3:E3");
  ws1.getCell("A3").value = `Date: ${new Date().toISOString().split("T")[0]} | Currency: USD | Type: Budget Estimate`;
  ws1.getCell("A3").font = { name: "Calibri", size: 10, italic: true };

  // Headers row 5
  const headers = ["GRAND TOTAL", "Cost", "Selling Price", "Margin $", "Margin %"];
  const headerRow = ws1.getRow(5);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: i === 0 ? `FF${ANC_BLUE}` : `FF${DARK_BG}` },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  // Grand totals row 6
  const totalCost = toUsd(estimate.totalCost?.amountMicros || 0);
  const totalSell = toUsd(estimate.totalSell?.amountMicros || 0);
  ws1.getCell("B6").value = totalCost;
  ws1.getCell("B6").numFmt = '"$"#,##0';
  ws1.getCell("B6").font = { name: "Calibri", size: 14, bold: true };
  ws1.getCell("C6").value = totalSell;
  ws1.getCell("C6").numFmt = '"$"#,##0';
  ws1.getCell("C6").font = { name: "Calibri", size: 14, bold: true };
  ws1.getCell("D6").value = { formula: "C6-B6" };
  ws1.getCell("D6").numFmt = '"$"#,##0';
  ws1.getCell("D6").font = { name: "Calibri", size: 14, bold: true };
  ws1.getCell("E6").value = { formula: "IFERROR(1-B6/C6,0)" };
  ws1.getCell("E6").numFmt = "0.0%";
  ws1.getCell("E6").font = { name: "Calibri", size: 14, bold: true, color: { argb: `FF${MARGIN_GREEN}` } };
  ws1.getRow(6).height = 35;

  // Line item headers row 8
  const lineHeaders = ["Line Item", "Cost", "Selling Price", "Margin $", "Margin %"];
  const lhRow = ws1.getRow(8);
  lineHeaders.forEach((h, i) => {
    const cell = lhRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ANC_BLUE}` } };
    cell.alignment = { horizontal: "center" };
  });

  // Line items
  let dataRow = 9;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const r = dataRow + i;
    const row = ws1.getRow(r);
    const cost = toUsd(line.lineCost?.amountMicros || 0);
    const margin = (line.marginPct || 30) / 100;
    const displayInfo = `${line.displayName || line.name} (${line.widthFt || "?"}×${line.heightFt || "?"}ft) (${line.pitchMm || "?"}mm)`;

    row.getCell(1).value = displayInfo;
    row.getCell(1).font = { name: "Calibri", size: 10 };
    row.getCell(2).value = cost;
    row.getCell(2).numFmt = '"$"#,##0';
    row.getCell(3).value = { formula: `IFERROR(B${r}/(1-${margin}),0)` };
    row.getCell(3).numFmt = '"$"#,##0';
    row.getCell(4).value = { formula: `C${r}-B${r}` };
    row.getCell(4).numFmt = '"$"#,##0';
    row.getCell(5).value = { formula: `IFERROR(1-B${r}/C${r},0)` };
    row.getCell(5).numFmt = "0%";
    row.getCell(5).font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: `FF${margin >= 0.25 ? MARGIN_GREEN : AMBER}` },
    };

    if (i % 2 === 1) {
      for (let c = 1; c <= 5; c++) {
        row.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${LIGHT_GRAY}` },
        };
      }
    }
  }

  // Spare parts + bond rows
  const spareRow = dataRow + lines.length;
  const bondRow = spareRow + 1;
  const spareCost = toUsd(estimate.sparePartsCost?.amountMicros || 0);
  const bondAmt = toUsd(estimate.bondAmount?.amountMicros || 0);

  ws1.getCell(`A${spareRow}`).value = "Spare Parts (5%)";
  ws1.getCell(`B${spareRow}`).value = spareCost;
  ws1.getCell(`B${spareRow}`).numFmt = '"$"#,##0';
  ws1.getCell(`C${spareRow}`).value = spareCost;
  ws1.getCell(`C${spareRow}`).numFmt = '"$"#,##0';
  ws1.getCell(`D${spareRow}`).value = 0;
  ws1.getCell(`E${spareRow}`).value = 0;
  ws1.getCell(`E${spareRow}`).numFmt = "0%";

  ws1.getCell(`A${bondRow}`).value = "Bond (1.5%)";
  ws1.getCell(`B${bondRow}`).value = bondAmt;
  ws1.getCell(`B${bondRow}`).numFmt = '"$"#,##0';
  ws1.getCell(`C${bondRow}`).value = bondAmt;
  ws1.getCell(`C${bondRow}`).numFmt = '"$"#,##0';
  ws1.getCell(`D${bondRow}`).value = 0;
  ws1.getCell(`E${bondRow}`).value = 0;
  ws1.getCell(`E${bondRow}`).numFmt = "0%";

  // Grand total row
  const gtRow = bondRow + 1;
  ws1.getCell(`A${gtRow}`).value = "GRAND TOTAL";
  ws1.getCell(`A${gtRow}`).font = { name: "Calibri", size: 14, bold: true };
  ws1.getCell(`B${gtRow}`).value = { formula: `SUM(B${dataRow}:B${bondRow})` };
  ws1.getCell(`B${gtRow}`).numFmt = '"$"#,##0';
  ws1.getCell(`B${gtRow}`).font = { name: "Calibri", size: 14, bold: true };
  ws1.getCell(`C${gtRow}`).value = { formula: `SUM(C${dataRow}:C${bondRow})` };
  ws1.getCell(`C${gtRow}`).numFmt = '"$"#,##0';
  ws1.getCell(`C${gtRow}`).font = { name: "Calibri", size: 14, bold: true };
  ws1.getCell(`D${gtRow}`).value = { formula: `C${gtRow}-B${gtRow}` };
  ws1.getCell(`D${gtRow}`).numFmt = '"$"#,##0';
  ws1.getCell(`D${gtRow}`).font = { name: "Calibri", size: 14, bold: true };
  ws1.getCell(`E${gtRow}`).value = { formula: `IFERROR(1-B${gtRow}/C${gtRow},0)` };
  ws1.getCell(`E${gtRow}`).numFmt = "0.0%";
  ws1.getCell(`E${gtRow}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: `FF${MARGIN_GREEN}` } };

  // ── Sheet 2: Display Specifications ──
  const ws2 = workbook.addWorksheet("Display Specifications", {
    properties: { tabColor: { argb: `FF${GREEN}` } },
  });
  ws2.columns = [{ width: 22 }, { width: 30 }];
  ws2.mergeCells("A1:B1");
  ws2.getCell("A1").value = "DISPLAY SPECIFICATIONS";
  ws2.getCell("A1").font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  ws2.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GREEN}` } };
  ws2.getRow(1).height = 40;

  let specRow = 3;
  for (const line of lines) {
    ws2.mergeCells(`A${specRow}:B${specRow}`);
    ws2.getCell(`A${specRow}`).value = line.displayName || line.name;
    ws2.getCell(`A${specRow}`).font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    ws2.getCell(`A${specRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ANC_BLUE}` } };
    specRow++;

    const specs = [
      ["Dimensions", `${line.widthFt || "?"}' × ${line.heightFt || "?"}' ft`],
      ["Total Area", `${line.totalSqFt || "?"} sq ft`],
      ["Pixel Pitch", `${line.pitchMm || "?"}mm`],
      ["Environment", line.lineEnvironment || "—"],
      ["Product Match", line.productMatch || "—"],
      ["Cost", `$${toUsd(line.lineCost?.amountMicros || 0).toLocaleString()}`],
      ["Sell", `$${toUsd(line.lineSell?.amountMicros || 0).toLocaleString()}`],
      ["Margin", `${line.marginPct || 30}%`],
    ];

    for (let i = 0; i < specs.length; i++) {
      ws2.getCell(`A${specRow}`).value = specs[i][0];
      ws2.getCell(`B${specRow}`).value = specs[i][1];
      ws2.getCell(`A${specRow}`).font = { name: "Calibri", size: 10 };
      ws2.getCell(`B${specRow}`).font = { name: "Calibri", size: 10 };
      if (i % 2 === 0) {
        ws2.getCell(`A${specRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${LIGHT_GRAY}` } };
        ws2.getCell(`B${specRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${LIGHT_GRAY}` } };
      }
      specRow++;
    }
    specRow++;
  }

  // ── Sheet 3: Margin Waterfall ──
  const ws3 = workbook.addWorksheet("Margin Waterfall", {
    properties: { tabColor: { argb: `FF${AMBER}` } },
  });
  ws3.columns = [{ width: 32 }, { width: 18 }, { width: 18 }, { width: 15 }, { width: 20 }];
  ws3.mergeCells("A1:E1");
  ws3.getCell("A1").value = "MARGIN WATERFALL ANALYSIS";
  ws3.getCell("A1").font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  ws3.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${AMBER}` } };
  ws3.getRow(1).height = 40;

  const wfHeaders = ["Category", "Cost", "Selling Price", "Margin %", "Margin $"];
  wfHeaders.forEach((h, i) => {
    const cell = ws3.getRow(3).getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${DARK_BG}` } };
    cell.alignment = { horizontal: "center" };
  });

  let wfRow = 4;
  for (const line of lines) {
    const cost = toUsd(line.lineCost?.amountMicros || 0);
    const sell = toUsd(line.lineSell?.amountMicros || 0);
    const margin = (line.marginPct || 30) / 100;
    ws3.getCell(`A${wfRow}`).value = `${line.displayName || line.name} (${line.pitchMm || "?"}mm)`;
    ws3.getCell(`B${wfRow}`).value = cost;
    ws3.getCell(`B${wfRow}`).numFmt = '"$"#,##0';
    ws3.getCell(`C${wfRow}`).value = sell;
    ws3.getCell(`C${wfRow}`).numFmt = '"$"#,##0';
    ws3.getCell(`D${wfRow}`).value = margin;
    ws3.getCell(`D${wfRow}`).numFmt = "0%";
    ws3.getCell(`D${wfRow}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: `FF${MARGIN_GREEN}` } };
    ws3.getCell(`E${wfRow}`).value = sell - cost;
    ws3.getCell(`E${wfRow}`).numFmt = '"$"#,##0';
    wfRow++;
  }

  return workbook;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const estimateId = searchParams.get("estimateId");

    if (!estimateId) {
      return NextResponse.json(
        { error: "Missing estimateId parameter" },
        { status: 400 }
      );
    }

    const token = TWENTY_TOKEN || searchParams.get("token") || "";
    if (!token) {
      return NextResponse.json(
        { error: "No Twenty API token configured" },
        { status: 401 }
      );
    }

    // Fetch estimate from Twenty
    const estRes = await fetch(`${TWENTY_URL}/rest/estimates/${estimateId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!estRes.ok) {
      return NextResponse.json(
        { error: `Estimate not found: ${estRes.status}` },
        { status: 404 }
      );
    }
    const estData = await estRes.json();
    const estimate = estData.data?.estimate;

    // Fetch estimate lines
    const linesRes = await fetch(
      `${TWENTY_URL}/rest/estimateLines?filter=estimateId[eq]:${estimateId}&limit=60`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const linesData = await linesRes.json();
    const lines = linesData.data?.estimateLines || [];

    // Generate Excel
    const workbook = await generateExcel(estimate, lines);

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `${(estimate.projectName || estimate.name || "Estimate").replace(/[^a-zA-Z0-9]/g, "_")}_Margin_Analysis.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("[export-excel] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
