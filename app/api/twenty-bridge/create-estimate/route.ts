/**
 * POST /api/twenty-bridge/create-estimate
 *
 * Bridge endpoint: receives estimate data from Twenty CRM,
 * creates a proposal in the Proposal Engine (rag2), and returns the URL.
 *
 * Twenty AI skill calls this endpoint → rag2 creates the spreadsheet →
 * URL is stored back on the Twenty Estimate record.
 */

import { NextRequest, NextResponse } from "next/server";

const RAG2_URL = process.env.RAG2_BASE_URL || "https://proposals.anc.com";
const RAG2_API_KEY =
  process.env.RAG2_AGENT_SKILL_API_KEY || "ca0eedbf04859d72d40b825a391a80157565e6a3bc945ac4";
const TWENTY_URL =
  process.env.TWENTY_API_URL || "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_TOKEN = process.env.TWENTY_API_TOKEN || "";
const BRIDGE_SECRET = process.env.TWENTY_BRIDGE_SECRET || "twenty-bridge-2026";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authHeader = request.headers.get("x-bridge-secret");
    if (authHeader !== BRIDGE_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      estimateId,
      projectName,
      clientName,
      displays,
      documentType = "budget",
      notes,
    } = body;

    if (!estimateId || !projectName || !displays?.length) {
      return NextResponse.json(
        { error: "Missing required fields: estimateId, projectName, displays" },
        { status: 400 }
      );
    }

    // Step 1: Create proposal in rag2 via agent-skill endpoint
    const lineItems = displays.map(
      (d: { name: string; cost: number; sell: number }) => ({
        description: d.name,
        price: d.sell || d.cost,
      })
    );

    const rag2Response = await fetch(
      `${RAG2_URL}/api/agent-skill/create-proposal`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": RAG2_API_KEY,
        },
        body: JSON.stringify({
          client_name: clientName || projectName,
          project_name: projectName,
          document_type: documentType,
          line_items: lineItems,
          notes: notes || "Created from Twenty CRM estimate",
        }),
      }
    );

    if (!rag2Response.ok) {
      const errText = await rag2Response.text();
      console.error("[twenty-bridge] rag2 error:", rag2Response.status, errText);
      return NextResponse.json(
        {
          error: "Failed to create proposal in Proposal Engine",
          detail: errText.slice(0, 200),
        },
        { status: 502 }
      );
    }

    const rag2Data = await rag2Response.json();
    const proposalUrl = rag2Data.project_url;
    const proposalId = rag2Data.project_id;

    // Step 2: Update the Twenty Estimate record with the URL
    if (TWENTY_TOKEN && proposalUrl) {
      try {
        await fetch(`${TWENTY_URL}/rest/estimates/${estimateId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TWENTY_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            estimatorUrl: {
              primaryLinkUrl: proposalUrl,
              primaryLinkLabel: "Open in Estimator",
              secondaryLinks: [],
            },
          }),
        });
      } catch (e) {
        console.error("[twenty-bridge] Failed to update Twenty estimate:", e);
        // Non-fatal — still return the URL
      }
    }

    return NextResponse.json({
      success: true,
      proposalUrl,
      proposalId,
      estimateId,
      summary: rag2Data.summary,
    });
  } catch (err: any) {
    console.error("[twenty-bridge] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
