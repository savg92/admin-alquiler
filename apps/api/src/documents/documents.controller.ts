import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard, type RequestActor } from "../auth/jwt.guard";
import { PermissionsGuard, RequirePermission } from "../auth/permissions.guard";
import { DocumentsService } from "./documents.service";

interface ActorRequest extends Request {
  actor?: RequestActor;
}

function orgIdOf(req: ActorRequest): string {
  const value = req.headers["x-org-id"];
  const orgId = Array.isArray(value) ? value[0] : value;
  if (!orgId) {
    throw new ForbiddenException("Organization scope required.");
  }
  return orgId;
}

function actorIdOf(req: ActorRequest): string {
  const actor = req.actor;
  if (!actor) {
    throw new ForbiddenException("Authentication required.");
  }
  return actor.userId;
}

@ApiTags("documents")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post("document-templates")
  @RequirePermission("document:write")
  @ApiResponse({ status: 201, description: "Document template created." })
  createTemplate(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const {
      name,
      language,
      body: text,
    } = body as {
      name?: unknown;
      language?: unknown;
      body?: unknown;
    };
    if (typeof name !== "string" || typeof language !== "string" || typeof text !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.documents.createTemplate(orgIdOf(req), actorIdOf(req), name, language, text);
  }

  @Get("document-templates")
  @RequirePermission("document:read")
  @ApiResponse({ status: 200, description: "Document templates with version metadata." })
  listTemplates(@Req() req: ActorRequest) {
    return this.documents.listTemplates(orgIdOf(req));
  }

  @Put("document-templates/:id")
  @RequirePermission("document:write")
  @ApiResponse({ status: 200, description: "Template body updated (version bumped)." })
  updateTemplate(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { body: text } = body as { body?: unknown };
    if (typeof text !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.documents.updateTemplate(orgIdOf(req), actorIdOf(req), id, text);
  }

  @Post("documents")
  @RequirePermission("document:write")
  @ApiResponse({ status: 201, description: "Document created from template or raw body." })
  createDocument(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const {
      templateId,
      title,
      body: text,
    } = body as {
      templateId?: unknown;
      title?: unknown;
      body?: unknown;
    };
    if (typeof title !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (templateId !== undefined && typeof templateId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (text !== undefined && typeof text !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.documents.createDocument(
      orgIdOf(req),
      actorIdOf(req),
      templateId === undefined && text === undefined
        ? { title }
        : {
            title,
            ...(templateId === undefined ? {} : { templateId }),
            ...(text === undefined ? {} : { body: text }),
          },
    );
  }

  @Get("documents")
  @RequirePermission("document:read")
  @ApiResponse({ status: 200, description: "Organization documents." })
  listDocuments(@Req() req: ActorRequest) {
    const query = (req.query as Record<string, unknown> | undefined) ?? {};
    const status = typeof query["status"] === "string" ? query["status"] : undefined;
    return status === undefined
      ? this.documents.listDocuments(orgIdOf(req))
      : this.documents.listDocuments(orgIdOf(req), status);
  }

  @Get("documents/:id")
  @RequirePermission("document:read")
  @ApiResponse({ status: 200, description: "Document with versions." })
  getDocument(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.documents.getDocument(id, orgIdOf(req));
  }

  @Put("documents/:id")
  @RequirePermission("document:write")
  @ApiResponse({ status: 200, description: "Edit document (new version)." })
  editDocument(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { body: text, storageRef } = body as { body?: unknown; storageRef?: unknown };
    if (typeof text !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (storageRef !== undefined && storageRef !== null && typeof storageRef !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.documents.editDocument(
      orgIdOf(req),
      actorIdOf(req),
      id,
      text,
      storageRef === undefined || storageRef === null ? null : storageRef,
    );
  }

  @Post("documents/:id/transitions")
  @RequirePermission("document:write")
  @ApiResponse({ status: 201, description: "Lifecycle transition with guards." })
  transition(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { to } = body as { to?: unknown };
    if (typeof to !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.documents.transitionDocument(
      orgIdOf(req),
      actorIdOf(req),
      id,
      to as "DRAFT" | "IN_REVIEW" | "APPROVED" | "SIGNED" | "FINAL" | "ARCHIVED",
    );
  }

  @Post("documents/:id/approvals")
  @RequirePermission("document:approve")
  @ApiResponse({ status: 201, description: "Record an approval decision." })
  approve(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { approved } = body as { approved?: unknown };
    if (typeof approved !== "boolean") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.documents.recordApproval(orgIdOf(req), actorIdOf(req), id, approved);
  }

  @Get("documents/:id/approvals")
  @RequirePermission("document:read")
  @ApiResponse({ status: 200, description: "Document approvals." })
  listApprovals(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.documents.listApprovals(id, orgIdOf(req));
  }

  @Post("documents/:id/signatures")
  @RequirePermission("document:write")
  @ApiResponse({ status: 201, description: "Record a signature." })
  sign(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (body !== null && (typeof body !== "object" || Array.isArray(body))) {
      throw new ForbiddenException("Invalid request.");
    }
    const proof =
      body !== null && typeof body === "object" && "proof" in body
        ? (body as { proof?: unknown }).proof
        : undefined;
    if (proof !== undefined && proof !== null && typeof proof !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return typeof proof === "string"
      ? this.documents.recordSignature(orgIdOf(req), actorIdOf(req), id, proof)
      : this.documents.recordSignature(orgIdOf(req), actorIdOf(req), id);
  }

  @Get("documents/:id/signatures")
  @RequirePermission("document:read")
  @ApiResponse({ status: 200, description: "Document signatures." })
  listSignatures(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.documents.listSignatures(id, orgIdOf(req));
  }

  @Post("documents/:id/pdf")
  @RequirePermission("document:write")
  @ApiResponse({ status: 201, description: "Queue deterministic async PDF generation." })
  requestPdf(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    const version =
      body !== null && typeof body === "object" && "version" in body
        ? (body as { version?: unknown }).version
        : undefined;
    if (version !== undefined && typeof version !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    return typeof version === "number"
      ? this.documents.requestPdf(orgIdOf(req), actorIdOf(req), id, version)
      : this.documents.requestPdf(orgIdOf(req), actorIdOf(req), id);
  }
}
