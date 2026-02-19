/*
  Warnings:

  - You are about to drop the column `redirectUrl` on the `TrackingLink` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,slug]` on the table `TrackingLink` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "TrackingLink_slug_key";

-- AlterTable
ALTER TABLE "TrackingLink" RENAME COLUMN "redirectUrl" TO "destinationUrl";

ALTER TABLE "TrackingLink" ADD COLUMN "platform" TEXT;

-- CreateIndex
CREATE INDEX "ClickLog_trackingLinkId_createdAt_idx" ON "ClickLog"("trackingLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "TrackingLink_platform_idx" ON "TrackingLink"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingLink_userId_slug_key" ON "TrackingLink"("userId", "slug");
