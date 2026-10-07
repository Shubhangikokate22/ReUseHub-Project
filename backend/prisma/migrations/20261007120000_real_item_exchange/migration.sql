ALTER TABLE `Item`
  ADD COLUMN `exchangePreferredCategories` JSON NULL,
  ADD COLUMN `activeExchangeRequestId` VARCHAR(191) NULL;

ALTER TABLE `ExchangeRequest`
  ADD COLUMN `offeredItemId` VARCHAR(191) NULL,
  ADD COLUMN `activeOfferedItemId` VARCHAR(191) NULL;

UPDATE `Item` AS `i`
JOIN `ExchangeRequest` AS `r` ON `r`.`activeItemId` = `i`.`id` AND `r`.`status` = 'ACCEPTED'
SET `i`.`activeExchangeRequestId` = `r`.`id`;

CREATE UNIQUE INDEX `ExchangeRequest_activeOfferedItemId_key`
  ON `ExchangeRequest`(`activeOfferedItemId`);
CREATE INDEX `ExchangeRequest_offeredItemId_idx`
  ON `ExchangeRequest`(`offeredItemId`);
CREATE INDEX `Item_activeExchangeRequestId_idx`
  ON `Item`(`activeExchangeRequestId`);

ALTER TABLE `ExchangeRequest`
  ADD CONSTRAINT `ExchangeRequest_offeredItemId_fkey`
  FOREIGN KEY (`offeredItemId`) REFERENCES `Item`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Item`
  ADD CONSTRAINT `Item_activeExchangeRequestId_fkey`
  FOREIGN KEY (`activeExchangeRequestId`) REFERENCES `ExchangeRequest`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
