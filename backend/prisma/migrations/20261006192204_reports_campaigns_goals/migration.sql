-- CreateTable
CREATE TABLE `ItemReport` (
    `id` VARCHAR(191) NOT NULL,
    `reporterId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NULL,
    `targetUserId` VARCHAR(191) NULL,
    `category` VARCHAR(50) NOT NULL,
    `description` VARCHAR(1500) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    `resolution` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ItemReport_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `ItemReport_reporterId_createdAt_idx`(`reporterId`, `createdAt`),
    INDEX `ItemReport_targetUserId_status_idx`(`targetUserId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DonationCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NOT NULL,
    `neededItems` TEXT NOT NULL,
    `deadline` DATETIME(3) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DonationCampaign_status_deadline_idx`(`status`, `deadline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CampaignContribution` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `donationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CampaignContribution_campaignId_createdAt_idx`(`campaignId`, `createdAt`),
    UNIQUE INDEX `CampaignContribution_campaignId_donationId_key`(`campaignId`, `donationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SustainabilityGoal` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `metric` VARCHAR(30) NOT NULL,
    `target` DECIMAL(10, 3) NOT NULL,
    `deadline` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SustainabilityGoal_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ItemReport` ADD CONSTRAINT `ItemReport_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemReport` ADD CONSTRAINT `ItemReport_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignContribution` ADD CONSTRAINT `CampaignContribution_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `DonationCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignContribution` ADD CONSTRAINT `CampaignContribution_donationId_fkey` FOREIGN KEY (`donationId`) REFERENCES `Donation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignContribution` ADD CONSTRAINT `CampaignContribution_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SustainabilityGoal` ADD CONSTRAINT `SustainabilityGoal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
