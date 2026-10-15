/*
  Warnings:

  - Added the required column `modelKey` to the `Machine` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "modelKey" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Machine_modelKey_idx" ON "Machine"("modelKey");
