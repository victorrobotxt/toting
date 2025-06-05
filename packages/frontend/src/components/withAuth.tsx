import { useRouter } from 'next/router';
import { useAuth, Role } from '../lib/AuthProvider';
import Forbidden from './Forbidden';

export default function withAuth(
  Component: React.ComponentType<any>,
  roles: Role[] = ['admin', 'user', 'verifier']
): React.FC<any> {
  return function Protected(props: any) {
    const { isLoggedIn, role, ready } = useAuth();
    const router = useRouter();
    if (!ready) return null;
    if (!isLoggedIn) { router.replace('/login'); return null; }
    if (!roles.includes(role)) return <Forbidden />;
    return <Component {...props} />;
  };
}
