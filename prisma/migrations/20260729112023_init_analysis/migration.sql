-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('pending', 'loading', 'extracting', 'analyzing', 'generating', 'complete', 'failed');

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceInput" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'pending',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "screenshotUrl" TEXT,
    "rawData" JSONB,
    "aiOutput" JSONB,
    "markdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);
