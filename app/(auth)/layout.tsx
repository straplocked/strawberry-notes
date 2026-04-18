import { IconBerry } from '@/components/icons';
import styles from './auth.module.css';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <IconBerry size={38} />
          <div>
            <div className={styles.brandName}>Strawberry</div>
            <div className={styles.brandSub}>Notes</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
