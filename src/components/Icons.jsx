import React from 'react';

function IconBase({ children, size = 20, ...props }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function BrandMark({ size = 32 }) {
  return <img aria-hidden="true" src="/icons/icon128.png" width={size} height={size} alt="" />;
}

export const RefreshIcon = (props) => (
  <IconBase {...props}><path d="M20 6v5h-5" /><path d="M18.5 16a8 8 0 1 1 .8-8.4L20 11" /></IconBase>
);
export const SettingsIcon = (props) => (
  <IconBase {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></IconBase>
);
export const CloseIcon = (props) => <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>;
export const ArrowLeftIcon = (props) => <IconBase {...props}><path d="m15 18-6-6 6-6" /></IconBase>;
export const CheckIcon = (props) => <IconBase {...props}><path d="m5 12 4 4L19 6" /></IconBase>;
export const CopyIcon = (props) => <IconBase {...props}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></IconBase>;
export const PlayIcon = (props) => <IconBase {...props}><path d="m9 7 8 5-8 5V7Z" /></IconBase>;
export const EyeIcon = (props) => <IconBase {...props}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></IconBase>;
export const EyeOffIcon = (props) => <IconBase {...props}><path d="m3 3 18 18M10.7 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.7M6.4 6.4C3.9 8.2 2.5 12 2.5 12s3.5 6 9.5 6a9.4 9.4 0 0 0 3.1-.5M9.9 9.9a3 3 0 0 0 4.2 4.2" /></IconBase>;
export const LockIcon = (props) => <IconBase {...props}><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></IconBase>;
export const AlertIcon = (props) => <IconBase {...props}><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></IconBase>;
