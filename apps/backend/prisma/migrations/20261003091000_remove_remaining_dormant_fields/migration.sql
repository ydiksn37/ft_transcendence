DROP INDEX "TournamentEntry_userId_registeredAt_idx";

ALTER TABLE "ChatRoomMembership" DROP COLUMN "joinedAt";
ALTER TABLE "TournamentEntry" DROP COLUMN "registeredAt";
ALTER TABLE "Achievement"
  DROP COLUMN "iconUrl",
  DROP COLUMN "isSecret";

CREATE INDEX "TournamentEntry_userId_idx" ON "TournamentEntry"("userId");
