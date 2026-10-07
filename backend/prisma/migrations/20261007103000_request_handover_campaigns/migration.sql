ALTER TABLE `ExchangeRequest`
  ADD COLUMN `handoverStatus` ENUM('PROPOSED', 'REJECTED', 'ACCEPTED', 'COMPLETED') NULL,
  ADD COLUMN `activeItemId` VARCHAR(191) NULL;

UPDATE `ExchangeRequest` AS `activeRequest`
JOIN (SELECT `itemId`, MIN(`id`) AS `winnerId` FROM `ExchangeRequest` WHERE `status` = 'ACCEPTED' GROUP BY `itemId`) AS `winners`
  ON `winners`.`itemId` = `activeRequest`.`itemId`
SET `activeRequest`.`activeItemId` = `activeRequest`.`itemId`, `activeRequest`.`handoverStatus` = NULL, `activeRequest`.`handoverCodeHash` = NULL, `activeRequest`.`handoverCodeAttempts` = 0, `activeRequest`.`handoverLockedUntil` = NULL
WHERE `activeRequest`.`id` = `winners`.`winnerId`;

UPDATE `ExchangeRequest` AS `duplicateRequest`
JOIN (SELECT `itemId`, MIN(`id`) AS `winnerId` FROM `ExchangeRequest` WHERE `status` = 'ACCEPTED' GROUP BY `itemId`) AS `winners`
  ON `winners`.`itemId` = `duplicateRequest`.`itemId`
SET `duplicateRequest`.`status` = 'PENDING', `duplicateRequest`.`activeItemId` = NULL, `duplicateRequest`.`handoverStatus` = NULL, `duplicateRequest`.`handoverCodeHash` = NULL
WHERE `duplicateRequest`.`status` = 'ACCEPTED' AND `duplicateRequest`.`id` <> `winners`.`winnerId`;

CREATE UNIQUE INDEX `ExchangeRequest_activeItemId_key` ON `ExchangeRequest` (`activeItemId`);

ALTER TABLE `DonationCampaign`
  ADD COLUMN `startDate` DATETIME(3) NULL,
  ADD COLUMN `endDate` DATETIME(3) NULL,
  ADD COLUMN `imageUrl` VARCHAR(2048) NULL,
  ADD COLUMN `acceptedCategories` TEXT NULL,
  ADD COLUMN `location` VARCHAR(200) NULL,
  ADD COLUMN `instructions` TEXT NULL,
  ADD COLUMN `coordinator` VARCHAR(150) NULL;

CREATE TABLE `CampaignDonation` (
  `id` VARCHAR(191) NOT NULL,
  `campaignId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `itemDetails` VARCHAR(500) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `status` ENUM('SUBMITTED', 'RECEIVED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SUBMITTED',
  `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `CampaignDonation_campaignId_status_submittedAt_idx` (`campaignId`, `status`, `submittedAt`),
  INDEX `CampaignDonation_userId_submittedAt_idx` (`userId`, `submittedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CampaignDonation`
  ADD CONSTRAINT `CampaignDonation_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `DonationCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CampaignDonation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
