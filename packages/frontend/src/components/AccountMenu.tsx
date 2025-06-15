import { useState } from 'react';
import { useAuth } from '../lib/AuthProvider';
import ThemeToggle from './ThemeToggle';
import { useI18n } from '../lib/I18nProvider';
import RoleSwitchModal from './RoleSwitchModal';

export default function AccountMenu() {
  const { logout, mode, setMode, role } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [showRole, setShowRole] = useState(false);

  const toggleMode = () => {
    setMode(mode === 'mock' ? 'eid' : 'mock');
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-label="Account menu" style={{border:'none',background:'transparent'}}>
        <span style={{width:24,height:24,borderRadius:'9999px',background:'#ccc',display:'inline-block'}} />
      </button>
      {open && (
        <div style={{ position:'absolute', right:0, marginTop:'0.5rem', background:'var(--color-background)', border:'1px solid var(--color-muted)', borderRadius:'4px', padding:'0.5rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          <button onClick={logout}>{t('account.logout')}</button>
          <button onClick={toggleMode}>{t('account.switch')}</button>
          {role === 'admin' && (
            <button onClick={() => setShowRole(true)}>{t('account.role')}</button>
          )}
          <ThemeToggle />
        </div>
      )}
      {showRole && <RoleSwitchModal onClose={() => setShowRole(false)} />}
    </div>
  );
}
