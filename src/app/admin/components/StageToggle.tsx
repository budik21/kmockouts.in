'use client';

import SliderToggle from './SliderToggle';

/**
 * Stage switch for the Pick'em admin sub-tabs: group stage vs play-off.
 * Thin wrapper over the generic {@link SliderToggle}.
 */
export default function StageToggle({
  value,
  onChange,
}: {
  value: 'group' | 'playoff';
  onChange: (v: 'group' | 'playoff') => void;
}) {
  return (
    <SliderToggle<'group' | 'playoff'>
      ariaLabel="Stage"
      value={value}
      onChange={onChange}
      options={[
        { key: 'group', label: 'Group stage' },
        { key: 'playoff', label: 'Play-off' },
      ]}
    />
  );
}
