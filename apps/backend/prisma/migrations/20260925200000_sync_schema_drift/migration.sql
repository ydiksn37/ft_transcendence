-- AlterEnum
ALTER TYPE "GameMode" ADD VALUE 'LINES_40';
ALTER TYPE "GameMode" ADD VALUE 'MARATHON';

-- DropForeignKey
ALTER TABLE "DataExportRequest" DROP CONSTRAINT "DataExportRequest_userId_fkey";

-- DropForeignKey
ALTER TABLE "OrgMembership" DROP CONSTRAINT "OrgMembership_invitedBy_fkey";

-- DropForeignKey
ALTER TABLE "OrgMembership" DROP CONSTRAINT "OrgMembership_orgId_fkey";

-- DropForeignKey
ALTER TABLE "OrgMembership" DROP CONSTRAINT "OrgMembership_userId_fkey";

-- DropForeignKey
ALTER TABLE "Organization" DROP CONSTRAINT "Organization_creatorId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorSecret" TEXT;

-- DropTable
DROP TABLE "DataExportRequest";

-- DropTable
DROP TABLE "OrgMembership";

-- DropTable
DROP TABLE "Organization";

-- DropEnum
DROP TYPE "ExportStatus";

-- DropEnum
DROP TYPE "OrgRole";
