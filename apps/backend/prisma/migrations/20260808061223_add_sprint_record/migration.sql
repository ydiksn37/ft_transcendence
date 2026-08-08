-- CreateTable
CREATE TABLE "SprintRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "lines" INTEGER NOT NULL DEFAULT 40,
    "pieces" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SprintRecord_lines_timeMs_idx" ON "SprintRecord"("lines", "timeMs");

-- CreateIndex
CREATE INDEX "SprintRecord_userId_lines_timeMs_idx" ON "SprintRecord"("userId", "lines", "timeMs");

-- AddForeignKey
ALTER TABLE "SprintRecord" ADD CONSTRAINT "SprintRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
