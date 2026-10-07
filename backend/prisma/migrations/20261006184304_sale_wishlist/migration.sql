-- AlterTable
ALTER TABLE `item` ADD COLUMN `price` DECIMAL(10, 2) NULL,
    ADD COLUMN `priceNegotiable` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `status` ENUM('AVAILABLE', 'REQUESTED', 'EXCHANGED', 'SOLD', 'DONATED', 'REMOVED') NOT NULL DEFAULT 'AVAILABLE',
    MODIFY `exchangeType` ENUM('EXCHANGE', 'DONATION', 'SALE') NOT NULL DEFAULT 'EXCHANGE';

-- AlterTable
ALTER TABLE `sustainabilitymetric` MODIFY `eventType` ENUM('EXCHANGE_COMPLETED', 'DONATION_COMPLETED', 'SALE_COMPLETED') NOT NULL;

-- CreateTable
CREATE TABLE `Wishlist` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Wishlist_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Wishlist_itemId_idx`(`itemId`),
    UNIQUE INDEX `Wishlist_userId_itemId_key`(`userId`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Wishlist` ADD CONSTRAINT `Wishlist_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Wishlist` ADD CONSTRAINT `Wishlist_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
