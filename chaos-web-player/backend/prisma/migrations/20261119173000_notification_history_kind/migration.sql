-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `dedupe_key` VARCHAR(191) NULL,
    ADD COLUMN `kind` ENUM('NEW_TRACKS', 'PIRATE_DAY', 'CUSTOM') NOT NULL DEFAULT 'CUSTOM',
    ADD COLUMN `meta` JSON NULL,
    ADD COLUMN `title` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `notifications_dedupe_key_key` ON `notifications`(`dedupe_key`);

-- CreateIndex
CREATE INDEX `notifications_user_id_created_at_idx` ON `notifications`(`user_id`, `created_at`);

-- CreateIndex
CREATE INDEX `notification_reads_userId_idx` ON `notification_reads`(`userId`);

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
