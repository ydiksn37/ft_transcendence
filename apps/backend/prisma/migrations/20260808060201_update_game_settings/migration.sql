/*
  Warnings:

  - You are about to drop the column `isPhoneVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `fallSpeedMultiplier` on the `UserGameSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "isPhoneVerified";

-- AlterTable
ALTER TABLE "UserGameSettings" DROP COLUMN "fallSpeedMultiplier",
ADD COLUMN     "arr" INTEGER NOT NULL DEFAULT 33,
ADD COLUMN     "das" INTEGER NOT NULL DEFAULT 170,
ADD COLUMN     "dcd" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sdf" INTEGER NOT NULL DEFAULT 6;
