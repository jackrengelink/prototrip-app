import { ArrowLeft, Loader2, X } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { initials } from '../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  to?: string;
  href?: string;
  block?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, loading, to, href, block, className, children, disabled, ...rest }: ButtonProps) {
  const cls = `btn btn-${variant} btn-${size}${block ? ' btn-block' : ''}${className ? ` ${className}` : ''}`;
  const content = (
    <>
      {loading ? <Loader2 className="spin" size={18} aria-hidden /> : icon}
      {children !== undefined && children !== null && <span>{children}</span>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls}>
        {content}
      </Link>
    );
  }
  if (href) {
    const external = /^https?:/.test(href);
    return (
      <a href={href} className={cls} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={cls} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  to?: string;
  variant?: Variant;
}

export function IconButton({ label, icon, to, variant = 'ghost', className, ...rest }: IconButtonProps) {
  const cls = `icon-btn icon-btn-${variant}${className ? ` ${className}` : ''}`;
  if (to) {
    return (
      <Link to={to} className={cls} aria-label={label} title={label}>
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} aria-label={label} title={label} {...rest}>
      {icon}
    </button>
  );
}

export function Card({ children, className, accent, onClick }: { children: ReactNode; className?: string; accent?: string; onClick?: () => void }) {
  return (
    <div
      className={`card${className ? ` ${className}` : ''}${onClick ? ' card-click' : ''}`}
      style={accent ? ({ '--card-accent': accent } as React.CSSProperties) : undefined}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function Section({ title, actions, children, className, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`section${className ? ` ${className}` : ''}`} id={id}>
      {(title || actions) && (
        <div className="section-head">
          {title && <h2 className="section-title">{title}</h2>}
          {actions && <div className="section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: string | boolean; actions?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      {back && (
        <IconButton
          label="Back"
          icon={<ArrowLeft size={22} />}
          onClick={() => {
            if (typeof back === 'string') navigate(back);
            else if (window.history.length > 1) navigate(-1);
            else navigate('/');
          }}
        />
      )}
      <div className="page-header-text">
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

export function Badge({ children, tone = 'neutral', color, icon }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'success' | 'info' | 'organizer'; color?: string; icon?: ReactNode }) {
  return (
    <span className={`badge badge-${tone}`} style={color ? ({ '--badge-color': color } as React.CSSProperties) : undefined}>
      {icon}
      {children}
    </span>
  );
}

export function Chip({ selected, onClick, children, color, icon }: { selected?: boolean; onClick?: () => void; children: ReactNode; color?: string; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={`chip${selected ? ' chip-on' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
      style={color ? ({ '--chip-color': color } as React.CSSProperties) : undefined}
    >
      {color && <span className="chip-dot" />}
      {icon}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: { value: T; options: { value: T; label: ReactNode }[]; onChange(v: T): void; label?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`segmented segmented-${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children, optional, htmlFor, className }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; optional?: string; htmlFor?: string; className?: string }) {
  return (
    <div className={`field${error ? ' field-error' : ''}${className ? ` ${className}` : ''}`}>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {optional && <span className="field-optional"> · {optional}</span>}
        </label>
      )}
      {children}
      {error && <p className="field-error-text">{error}</p>}
      {hint && !error && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function TextInput(props: ComponentProps<'input'>) {
  return <input {...props} className={`input${props.className ? ` ${props.className}` : ''}`} />;
}

export function TextArea({ autoGrow = true, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoGrow || !ref.current) return;
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 640)}px`;
  }, [props.value, autoGrow]);
  return <textarea ref={ref} rows={3} {...props} className={`input textarea${props.className ? ` ${props.className}` : ''}`} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`input select${props.className ? ` ${props.className}` : ''}`}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange(v: boolean): void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <label htmlFor={id}>{label}</label>
        {hint && <p className="field-hint">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <Loader2 className="spin" size={28} aria-hidden />
      {label && <span>{label}</span>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Avatar({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, ...(color ? { background: color } : {}) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose(): void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    window.setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.modal-close)');
      (first ?? ref.current)?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" ref={ref} tabIndex={-1}>
        {(title || true) && (
          <div className="modal-head">
            <h2>{title}</h2>
            <IconButton className="modal-close" label="Close" icon={<X size={20} />} onClick={onClose} />
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="error-box" role="alert">
      {children}
    </div>
  );
}

export function Stack({ children, gap = 12, className }: { children: ReactNode; gap?: number; className?: string }) {
  return (
    <div className={`stack${className ? ` ${className}` : ''}`} style={{ gap }}>
      {children}
    </div>
  );
}

export function Row({ children, gap = 8, wrap, className, justify }: { children: ReactNode; gap?: number; wrap?: boolean; className?: string; justify?: 'between' | 'end' | 'start' }) {
  return (
    <div
      className={`row${className ? ` ${className}` : ''}`}
      style={{ gap, flexWrap: wrap ? 'wrap' : undefined, justifyContent: justify === 'between' ? 'space-between' : justify === 'end' ? 'flex-end' : undefined }}
    >
      {children}
    </div>
  );
}
