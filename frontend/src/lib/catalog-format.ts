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
  MANAGEMENT: 'Management',
  GEHU: 'GEHU',
  PARTIALLY_RETURNED: 'Partially returned',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due soon',
  SCRAP: 'Faulty (scrap)',
  NOT_IN_USE: 'Outdated (not in use)',
  UNDER_MAINTENANCE: 'Under maintenance',
  FAULTY: 'Faulty (scrap)',
  OUTDATED: 'Outdated (not in use)',
  WORKING: 'Active / in use',
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
