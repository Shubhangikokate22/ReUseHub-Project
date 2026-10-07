ALTER TABLE `ExchangeRequest`
  ADD COLUMN `handoverMeetingPoint` VARCHAR(30) NULL,
  ADD COLUMN `handoverOtherPoint` VARCHAR(50) NULL,
  ADD COLUMN `handoverDate` VARCHAR(10) NULL,
  ADD COLUMN `handoverTime` VARCHAR(5) NULL,
  ADD COLUMN `handoverCodeHash` VARCHAR(64) NULL,
  ADD COLUMN `handoverCodeAttempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `handoverLockedUntil` DATETIME(3) NULL;
