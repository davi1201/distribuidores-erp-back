// create-transfer.dto.ts
export class CreateTransferDto {
  originWarehouseId: string;
  destinationWarehouseId: string;
  items: {
    productId: string;
    quantity: number;
  }[];
}

// update-transfer-status.dto.ts
export class UpdateTransferStatusDto {
  status: 'APPROVED' | 'REJECTED' | 'COMPLETED';
}
