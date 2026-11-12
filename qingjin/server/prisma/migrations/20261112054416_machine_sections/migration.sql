-- CreateEnum
CREATE TYPE "SectionKind" AS ENUM ('TEXT', 'GALLERY');

-- CreateTable
CREATE TABLE "MachineSection" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "kind" "SectionKind" NOT NULL,
    "titleZh" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "descZh" TEXT,
    "descEn" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MachineSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineSectionItem" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "textZh" TEXT NOT NULL DEFAULT '',
    "textEn" TEXT NOT NULL DEFAULT '',
    "mediaId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MachineSectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MachineSection_machineId_sort_idx" ON "MachineSection"("machineId", "sort");

-- CreateIndex
CREATE INDEX "MachineSectionItem_sectionId_sort_idx" ON "MachineSectionItem"("sectionId", "sort");

-- CreateIndex
CREATE INDEX "MachineSectionItem_mediaId_idx" ON "MachineSectionItem"("mediaId");

-- AddForeignKey
ALTER TABLE "MachineSection" ADD CONSTRAINT "MachineSection_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineSectionItem" ADD CONSTRAINT "MachineSectionItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "MachineSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineSectionItem" ADD CONSTRAINT "MachineSectionItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
