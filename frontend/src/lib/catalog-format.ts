const labels: Record<string, string> = {
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
  INACTIVE: 'Inactive',
  AVAILABLE: 'Available',
  ISSUED: 'Issued',
  UNDER_REPAIR: 'Under repair',
  DAMAGED: 'Damaged',
  LOST: 'Lost',
  RETIRED: 'Retired',
  SERIALIZED: 'IT Assets',
  QUANTITY: 'IT Consumables',
  REUSABLE: 'Reusable',
  CONSUMABLE: 'Consumable',
  CONSUMED: 'Consumed',
  FACULTY: 'Faculty',
  STAFF: 'Staff',
  STUDENT: 'Student',
  DEPARTMENT: 'Department',
  AUTHORIZED_EXTERNAL: 'Authorized external',
  PARTIALLY_RETURNED: 'Partially returned',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due soon',
};

export function humanizeCatalogValue(value: string): string {
  return (
    labels[value] ??
    value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/^./, (character) => character.toUpperCase())
  );
}
