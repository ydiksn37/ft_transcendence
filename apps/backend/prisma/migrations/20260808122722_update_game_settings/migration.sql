/*
  Warnings:

  - You are about to drop the column `isEmailVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorContact` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorMethod` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "isEmailVerified",
DROP COLUMN "twoFactorContact",
DROP COLUMN "twoFactorMethod";

-- DropEnum
DROP TYPE "TwoFactorMethod";
