import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

type AuditInput = {
  action: string;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

/**
 * Records a sensitive action in the AuditLog. Never throws to the caller so an
 * auditing failure can't break the underlying operation (it is logged instead).
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error("logAudit failed:", error);
  }
}
