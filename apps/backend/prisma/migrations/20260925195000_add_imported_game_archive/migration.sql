CREATE TABLE "ImportedGameArchive" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "opponent" TEXT,
    "score" INTEGER,
    "apm" DECIMAL(8,2),
    "pps" DECIMAL(6,3),
    "lines" INTEGER,
    "sourceFormat" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedGameArchive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportedGameArchive_userId_playedAt_idx"
ON "ImportedGameArchive"("userId", "playedAt" DESC);

ALTER TABLE "ImportedGameArchive"
ADD CONSTRAINT "ImportedGameArchive_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
