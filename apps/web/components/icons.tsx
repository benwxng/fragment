import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" {...props}>
      {children}
    </svg>
  );
}

export function MarkIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 42" fill="none" {...props}>
<path d="M1.59026 20.0476C8.41761 25.6338 24.406 40.7329 49.5903 41C74.7745 40.7329 90.7629 25.6338 97.5903 20.0476C90.7157 14.5527 74.6184 1.07655 49.5903 1.00039C24.5621 1.07655 8.46478 14.5527 1.59026 20.0476Z" fill="white" stroke="white" strokeWidth="2"/>
<circle cx="49.5903" cy="21" r="20" fill="#526B59"/>
<path d="M49.5902 10.2V31.8M38.7902 21H60.3902M41.9535 13.3633L57.227 28.6368M41.9535 28.6368L57.227 13.3633" stroke="white" strokeWidth="2.4"/>
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="8.5" cy="8.5" r="5.25" />
      <path d="m12.5 12.5 4 4" />
    </IconBase>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m7 4.5 5.5 5.5L7 15.5" />
    </IconBase>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 4h9v9M16 4 6 14M14 11v5H4V6h5" />
    </IconBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5 5 10 10M15 5 5 15" />
    </IconBase>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 5h14M6 10h11M3 15h14" />
      <circle cx="6" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="11.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="3.5" y="11.5" width="5" height="5" rx="1" />
      <rect x="11.5" y="11.5" width="5" height="5" rx="1" />
    </IconBase>
  );
}
