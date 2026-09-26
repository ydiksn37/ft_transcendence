import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { useEffect, useId, useRef } from 'react';
import './design-system.css';

export const DsButton = ({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button className={`ds-button ${className}`} {...props} />
);

export const DsIconButton = ({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) => (
  <button className={`ds-icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>
);

export const DsPanel = ({ className = '', ...props }: HTMLAttributes<HTMLElement>) => (
  <section className={`ds-panel ${className}`} {...props} />
);

export const DsHeading = ({ level = 2, children, className = '', ...props }: HTMLAttributes<HTMLHeadingElement> & { level?: 1 | 2 | 3 }) => {
  const Tag = `h${level}` as const;
  return <Tag className={`ds-heading ${className}`} {...props}>{children}</Tag>;
};

export const DsInput = ({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={`ds-input ${className}`} {...props} />
);

export const DsSelect = ({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={`ds-select ${className}`} {...props} />
);

export const DsCheckbox = ({ children, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { children: ReactNode }) => (
  <label className={`ds-checkbox ${className}`}><input type="checkbox" {...props} />{children}</label>
);

export const DsField = ({ label, children, className = '', ...props }: LabelHTMLAttributes<HTMLLabelElement> & { label: string; children: ReactNode }) => (
  <label className={`ds-field ${className}`} {...props}><span>{label}</span>{children}</label>
);

export const DsBadge = ({ tone = 'info', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: 'info' | 'success' | 'warning' | 'danger' }) => (
  <span className={`ds-badge ds-badge-${tone} ${className}`} {...props} />
);

export const DsAlert = ({ tone = 'info', className = '', ...props }: HTMLAttributes<HTMLDivElement> & { tone?: 'info' | 'success' | 'warning' | 'danger' }) => (
  <div role="alert" className={`ds-alert ds-alert-${tone} ${className}`} {...props} />
);

export const DsSpinner = ({ label = 'Loading' }: { label?: string }) => (
  <span className="ds-spinner" role="status" aria-label={label} />
);

const iconPaths = {
  close: <path d="M5 5l14 14M19 5 5 19" />,
  check: <path d="m4 12 5 5L20 6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
} as const;

export type DsIconName = keyof typeof iconPaths;
export const DsIcon = ({ name, size = 20 }: { name: DsIconName; size?: number }) => (
  <svg className="ds-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {iconPaths[name]}
  </svg>
);

export const DsModal = ({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(element => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); previousFocus?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ds-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className="ds-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onMouseDown={event => event.stopPropagation()}>
        <header className="ds-modal-header">
          <DsHeading id={titleId} level={2}>{title}</DsHeading>
          <DsIconButton label="Close dialog" onClick={onClose}><DsIcon name="close" /></DsIconButton>
        </header>
        {children}
      </section>
    </div>
  );
};
