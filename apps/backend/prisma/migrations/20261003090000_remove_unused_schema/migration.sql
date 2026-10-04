-- Drop the unused notification feature and fields that have no writers.
DROP TABLE "Notification";
DROP TYPE "NotificationType";

ALTER TABLE "User" DROP COLUMN "deletedAt";
ALTER TABLE "ChatRoom" DROP COLUMN "relatedId";
ALTER TABLE "ChatRoomMembership" DROP COLUMN "lastReadAt";
ALTER TABLE "ChatMessage"
  DROP COLUMN "isDeleted",
  DROP COLUMN "deletedAt",
  DROP COLUMN "editedAt";
