import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canTransitionLifecycle } from "@admin-alquiler/ai";
import { buildAuditEvent } from "@admin-alquiler/domain";
import { AI_STORE } from "./tokens";
import type { AiStore } from "./store";

const RUNTIMES = ["local", "webgpu", "provider", "disabled"];
const LIFECYCLES = ["candidate", "installed", "evaluated", "approved", "active", "deprecated"];

@Injectable()
export class RegistryService {
  constructor(@Inject(AI_STORE) private readonly store: AiStore) {}

  async registerModel(
    orgId: string | null,
    actorId: string | null,
    input: {
      modelId: string;
      version: string;
      provider: string;
      runtime: string;
      quantization?: string | null;
      capabilities?: string[];
      contextSize?: number | null;
      languages?: string[];
      privacyTier?: string;
      hardware?: Record<string, unknown> | null;
    },
  ) {
    if (!/^[a-z0-9][a-z0-9._-]{1,80}$/.test(input.modelId)) {
      throw new BadRequestException("modelId must be 2-80 lowercase chars.");
    }
    if (input.version.trim().length === 0 || input.version.length > 40) {
      throw new BadRequestException("version must be 1-40 characters.");
    }
    if (!RUNTIMES.includes(input.runtime)) {
      throw new BadRequestException(`runtime must be one of: ${RUNTIMES.join(", ")}.`);
    }
    if (await this.store.findModel(input.modelId)) {
      throw new ConflictException("Model is already registered.");
    }
    const created = await this.store.registerModel({
      modelId: input.modelId,
      version: input.version.trim(),
      provider: input.provider.trim(),
      runtime: input.runtime,
      quantization:
        input.quantization === undefined || input.quantization === null ? null : input.quantization,
      capabilities: input.capabilities ?? [],
      contextSize: input.contextSize ?? null,
      languages: input.languages ?? [],
      privacyTier: input.privacyTier ?? "local-only",
      hardware: input.hardware ?? null,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        ...(orgId === null ? {} : { orgId }),
        ...(actorId === null ? {} : { actorId }),
        action: "ai.model_registered",
        entityType: "AIModel",
        entityId: created.id,
        metadata: { modelId: created.modelId, runtime: created.runtime },
      }),
    );
    return created;
  }

  async listModels(status?: string, runtime?: string) {
    if (status !== undefined && !LIFECYCLES.includes(status)) {
      throw new BadRequestException(`status must be one of: ${LIFECYCLES.join(", ")}.`);
    }
    if (runtime !== undefined && !RUNTIMES.includes(runtime)) {
      throw new BadRequestException(`runtime must be one of: ${RUNTIMES.join(", ")}.`);
    }
    return this.store.listModels(
      status === undefined && runtime === undefined
        ? {}
        : {
            ...(status === undefined ? {} : { status }),
            ...(runtime === undefined ? {} : { runtime }),
          },
    );
  }

  async transitionModel(orgId: string | null, actorId: string | null, modelId: string, to: string) {
    if (!LIFECYCLES.includes(to)) {
      throw new BadRequestException(`status must be one of: ${LIFECYCLES.join(", ")}.`);
    }
    const found = await this.store.findModel(modelId);
    if (!found) {
      throw new NotFoundException("Model not found.");
    }
    if (!canTransitionLifecycle(found.status, to)) {
      throw new BadRequestException(`Cannot transition model from ${found.status} to ${to}.`);
    }
    const updated = await this.store.setModelStatus(modelId, to);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        ...(orgId === null ? {} : { orgId }),
        ...(actorId === null ? {} : { actorId }),
        action: "ai.model_status_changed",
        entityType: "AIModel",
        entityId: updated.id,
        metadata: { from: found.status, to },
      }),
    );
    return updated;
  }
}
