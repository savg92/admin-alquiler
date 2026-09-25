import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { JwtAuthGuard, type RequestActor } from "./jwt.guard";

interface ActorRequest extends Request {
  actor?: RequestActor;
}

@ApiTags("auth")
@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @ApiResponse({ status: 200, description: "Email and password login." })
  @ApiResponse({ status: 400, description: "Invalid request body." })
  @ApiResponse({ status: 401, description: "Invalid credentials." })
  async login(@Body() body: unknown) {
    if (!body || typeof body !== "object") {
      return { error: { code: "INVALID_BODY", message: "Email and password are required." } };
    }
    const { email, password } = body as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || !email.includes("@") || typeof password !== "string") {
      return { error: { code: "INVALID_BODY", message: "Email and password are required." } };
    }
    return this.auth.login(email, password);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiResponse({ status: 204, description: "Revokes the current session." })
  async logout(@Req() req: ActorRequest): Promise<void> {
    const actor = req.actor;
    if (actor) {
      await this.auth.logout(actor.sessionId, actor.userId);
    }
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, description: "Current identity with memberships." })
  me(@Req() req: ActorRequest) {
    const actor = req.actor;
    if (!actor) {
      return { error: { code: "UNAUTHENTICATED", message: "Authentication required." } };
    }
    return {
      id: actor.userId,
      email: actor.email,
      memberships: actor.memberships.map((entry) => ({
        orgId: entry.orgId,
        status: entry.status,
        role: entry.roleName,
        permissions: entry.permissions,
      })),
    };
  }
}
