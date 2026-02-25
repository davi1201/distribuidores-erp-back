-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('READY', 'PRE_ORDER');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "deliveryType" "DeliveryType" NOT NULL DEFAULT 'READY';
