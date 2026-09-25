import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import './design-system.css';

export const DsButton = ({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button className={`ds-button ${className}`} {...props} />
);

export const DsIconButton = ({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) => (
  <button className="ds-icon-button" aria-label={label} title={label} {...props}>{children}</button>
);

export const DsPanel = ({ className = '', ...props }: HTMLAttributes<HTMLElement>) => (
  <section className={`ds-panel ${className}`} {...props} />
);

export const DsHeading = ({ level = 2, children, ...props }: HTMLAttributes<HTMLHeadingElement> & { level?: 1 | 2 | 3 }) => {
  const Tag = `h${level}` as const;
  return <Tag className="ds-heading" {...props}>{children}</Tag>;
};

export const DsInput = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input className="ds-input" {...props} />
);

export const DsSelect = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className="ds-select" {...props} />
);

export const DsCheckbox = ({ children, ...props }: InputHTMLAttributes<HTMLInputElement> & { children: ReactNode }) => (
  <label className="ds-checkbox"><input type="checkbox" {...props} />{children}</label>
);

export const DsField = ({ label, children, ...props }: LabelHTMLAttributes<HTMLLabelElement> & { label: string; children: ReactNode }) => (
  <label className="ds-field" {...props}><span>{label}</span>{children}</label>
);

export const DsBadge = ({ tone = 'info', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: 'info' | 'success' | 'warning' | 'danger' }) => (
  <span className={`ds-badge ds-badge-${tone}`} {...props} />
);

export const DsAlert = ({ tone = 'info', ...props }: HTMLAttributes<HTMLDivElement> & { tone?: 'info' | 'success' | 'warning' | 'danger' }) => (
  <div role="alert" className={`ds-alert ds-alert-${tone}`} {...props} />
);

export const DsSpinner = ({ label = 'Loading' }: { label?: string }) => (
  <span className="ds-spinner" role="status" aria-label={label} />
);

export const DsModal = ({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) => {
  if (!open) return null;
  return (
    <div className="ds-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="ds-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <DsHeading level={2}>{title}</DsHeading>
        {children}
      </section>
    </div>
  );
};
