const MATERIAL_CATEGORIES = [
  'Stationery',
  'Lab Equipment',
  'IT Equipment',
  'Electrical',
  'Furniture',
  'Tools',
  'Cleaning Supplies',
  'Safety Equipment',
  'Sports Equipment',
  'Uniforms',
] as const;

const CUSTOM_CATEGORY = '__CUSTOM__';

function categorySelectValue(value: string): string {
  if (!value) return '';
  return MATERIAL_CATEGORIES.some((category) => category === value) ? value : CUSTOM_CATEGORY;
}

export function MaterialCategoryField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const selectValue = categorySelectValue(value);
  const custom = selectValue === CUSTOM_CATEGORY;
  const customId = `${id}-custom`;
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-1.5">
      <label className="field-label" htmlFor={id}>
        Material group
      </label>
      <select
        aria-describedby={hintId}
        className="field-input"
        id={id}
        onChange={(event) => {
          const next = event.target.value;
          if (next === CUSTOM_CATEGORY) onChange('');
          else onChange(next);
        }}
        required
        value={selectValue}
      >
        <option value="">Choose material group</option>
        {MATERIAL_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
        <option value={CUSTOM_CATEGORY}>Other / custom</option>
      </select>
      <p className="text-xs leading-5 text-[var(--color-text-muted)]" id={hintId}>
        Use a fixed group to keep filters and reports clean.
      </p>
      {custom ? (
        <input
          className="field-input field-input-compact"
          id={customId}
          maxLength={120}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter custom material group"
          required
          value={value}
        />
      ) : null}
    </div>
  );
}
