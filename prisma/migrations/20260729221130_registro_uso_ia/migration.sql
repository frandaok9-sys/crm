-- CreateTable
CREATE TABLE "AssistantLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "question" TEXT,
    "reply" TEXT,
    "tools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantLog_createdAt_idx" ON "AssistantLog"("createdAt");

-- CreateIndex
CREATE INDEX "AssistantLog_userId_createdAt_idx" ON "AssistantLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantLog_channel_createdAt_idx" ON "AssistantLog"("channel", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantLog" ADD CONSTRAINT "AssistantLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

