-- AlterTable
ALTER TABLE `sustainabilitymetric` MODIFY `estimatedWasteAvoidedKg` DECIMAL(8, 3) NULL,
    MODIFY `estimatedCo2eAvoidedKg` DECIMAL(8, 3) NULL;

-- CreateTable
CREATE TABLE `EmissionFactor` (
    `id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `subcategory` VARCHAR(100) NOT NULL,
    `factorKgCO2e` DECIMAL(10, 3) NULL,
    `unit` VARCHAR(50) NOT NULL,
    `lifecycleBoundary` VARCHAR(180) NOT NULL,
    `sourceName` VARCHAR(255) NOT NULL,
    `sourceUrl` VARCHAR(2048) NOT NULL,
    `sourceYear` INTEGER NULL,
    `confidenceLevel` ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmissionFactor_confidenceLevel_idx`(`confidenceLevel`),
    UNIQUE INDEX `EmissionFactor_category_subcategory_key`(`category`, `subcategory`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SustainabilityCalculation` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `emissionFactorId` VARCHAR(191) NULL,
    `eventType` ENUM('EXCHANGE_COMPLETED', 'DONATION_COMPLETED', 'SALE_COMPLETED') NOT NULL,
    `referenceFactor` DECIMAL(10, 3) NULL,
    `displacementFactor` DECIMAL(5, 4) NOT NULL,
    `baselineEmissions` DECIMAL(10, 3) NULL,
    `reuseScenarioEmissions` DECIMAL(10, 3) NOT NULL,
    `transportEmissions` DECIMAL(10, 3) NOT NULL,
    `netAvoidedCO2e` DECIMAL(10, 3) NULL,
    `confidenceLevel` ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL,
    `assumptions` TEXT NOT NULL,
    `calculatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SustainabilityCalculation_itemId_key`(`itemId`),
    INDEX `SustainabilityCalculation_eventType_calculatedAt_idx`(`eventType`, `calculatedAt`),
    INDEX `SustainabilityCalculation_confidenceLevel_calculatedAt_idx`(`confidenceLevel`, `calculatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SustainabilityCalculation` ADD CONSTRAINT `SustainabilityCalculation_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SustainabilityCalculation` ADD CONSTRAINT `SustainabilityCalculation_emissionFactorId_fkey` FOREIGN KEY (`emissionFactorId`) REFERENCES `EmissionFactor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
