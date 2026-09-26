export interface GpuAdapterLike {
  limits?: {
    maxBufferSize?: number;
    maxStorageBufferBindingSize?: number;
    features?: Iterable<string>;
  };
  features?: Iterable<string>;
}

export interface GpuLike {
  requestAdapter(options?: { powerPreference?: string }): Promise<GpuAdapterLike | null>;
}

export interface MemoryInfoLike {
  deviceMemoryGb: number;
}

export type CapabilityRejection =
  "no-webgpu" | "no-adapter" | "insufficient-memory" | "insufficient-buffer" | "probe-failed";

export type CapabilityResult =
  | { supported: true; maxBufferBytes: number; features: string[] }
  | { supported: false; reason: CapabilityRejection };

/** Below this the browser is likely to be killed mid-inference on a mobile device. */
export const MIN_DEVICE_MEMORY_GB = 4;

/** A smaller allocation would fail at buffer creation anyway. */
export const MIN_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export async function probeWebGpu(
  gpu: GpuLike | undefined,
  memory: MemoryInfoLike | undefined,
): Promise<CapabilityResult> {
  if (gpu === undefined) {
    return { supported: false, reason: "no-webgpu" };
  }
  if (memory !== undefined && memory.deviceMemoryGb < MIN_DEVICE_MEMORY_GB) {
    return { supported: false, reason: "insufficient-memory" };
  }
  let adapter: GpuAdapterLike | null;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  } catch {
    return { supported: false, reason: "probe-failed" };
  }
  if (adapter === null) {
    return { supported: false, reason: "no-adapter" };
  }
  const maxBufferBytes = adapter.limits?.maxBufferSize ?? 0;
  if (maxBufferBytes < MIN_MAX_BUFFER_BYTES) {
    return { supported: false, reason: "insufficient-buffer" };
  }
  return {
    supported: true,
    maxBufferBytes,
    features: [...(adapter.features ?? adapter.limits?.features ?? [])],
  };
}

export function shouldUseWebGpu(capability: CapabilityResult): boolean {
  return capability.supported;
}

export function readMemoryInfo(
  nav: { deviceMemory?: number } | undefined,
): MemoryInfoLike | undefined {
  return nav?.deviceMemory === undefined ? undefined : { deviceMemoryGb: nav.deviceMemory };
}
