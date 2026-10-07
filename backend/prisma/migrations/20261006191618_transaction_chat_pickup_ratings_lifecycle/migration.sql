-- AlterTable
ALTER TABLE `exchangerequest` ADD COLUMN `pickupLocation` VARCHAR(80) NULL,
    ADD COLUMN `pickupNote` VARCHAR(500) NULL,
    ADD COLUMN `transportMode` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `Chat` (
    `id` VARCHAR(191) NOT NULL,
    `exchangeRequestId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Chat_exchangeRequestId_key`(`exchangeRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `body` VARCHAR(2000) NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMessage_chatId_createdAt_idx`(`chatId`, `createdAt`),
    INDEX `ChatMessage_senderId_readAt_idx`(`senderId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Rating` (
    `id` VARCHAR(191) NOT NULL,
    `exchangeRequestId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `feedback` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Rating_targetId_createdAt_idx`(`targetId`, `createdAt`),
    UNIQUE INDEX `Rating_exchangeRequestId_authorId_key`(`exchangeRequestId`, `authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ItemLifecycleEvent` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `exchangeRequestId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `event` VARCHAR(60) NOT NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ItemLifecycleEvent_itemId_createdAt_idx`(`itemId`, `createdAt`),
    INDEX `ItemLifecycleEvent_exchangeRequestId_createdAt_idx`(`exchangeRequestId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Chat` ADD CONSTRAINT `Chat_exchangeRequestId_fkey` FOREIGN KEY (`exchangeRequestId`) REFERENCES `ExchangeRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `Chat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rating` ADD CONSTRAINT `Rating_exchangeRequestId_fkey` FOREIGN KEY (`exchangeRequestId`) REFERENCES `ExchangeRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rating` ADD CONSTRAINT `Rating_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rating` ADD CONSTRAINT `Rating_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemLifecycleEvent` ADD CONSTRAINT `ItemLifecycleEvent_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemLifecycleEvent` ADD CONSTRAINT `ItemLifecycleEvent_exchangeRequestId_fkey` FOREIGN KEY (`exchangeRequestId`) REFERENCES `ExchangeRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemLifecycleEvent` ADD CONSTRAINT `ItemLifecycleEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
