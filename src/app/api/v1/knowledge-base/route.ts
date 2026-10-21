import { NextRequest, NextResponse } from "next/server";
import { UserError } from "@/lib/user-error";
import { readKnowledge } from "@/lib/ai/knowledge/retrieval";
import { prisma } from "@/lib/prisma";
import { authenticateOrgRequest } from "@/lib/api-key-auth";

// Internal n8n query: GET /api/v1/knowledge-base?orgId=xxx&category=faq
// Secured by X-Api-Key matching THAT organization's own n8nWebhookSecret
// (never a shared secret — knowing another org's id is not enough to read
// its knowledge base), or by NextAuth session for browser callers.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const authResult = await authenticateOrgRequest(req);
  if (authResult.response) return authResult.response;
  const orgId = authResult.orgId;

  const category = searchParams.get("category") ?? undefined;
  const search = searchParams.get("q") ?? undefined;

  if (searchParams.has("agentInstanceId")) return NextResponse.json({ error: "Agent identity is derived server-side" }, { status: 400 });
  let retrieval;
  try { retrieval = await readKnowledge(orgId, search ?? "", category); }
  catch (error) {
    if (error instanceof UserError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
  if (retrieval?.enabled) {
    const data = retrieval.selected.map(s => ({ id: s.articleId, title: s.title, content: s.content, category: s.category, tags: s.tags, updatedAt: s.createdAt, revision: s.version }));
    return NextResponse.json({ data, meta: { total: retrieval.matching, retrieval: { eligible: retrieval.eligible, matching: retrieval.matching, considered: retrieval.considered, selected: data.length, truncated: retrieval.truncated, characters: retrieval.characters, estimatedTokens: retrieval.estimatedTokens, candidateLimitReached: retrieval.candidateLimitReached, limits: retrieval.limits } } });
  }

  const articles = await prisma.knowledgeBase.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { content: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: articles, meta: { total: articles.length } });
}
