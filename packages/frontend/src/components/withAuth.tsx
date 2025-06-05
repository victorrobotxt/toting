import { useRouter } from 'next/router';
import { useAuth, Role } from '../lib/AuthProvider';
import { useEffect } from 'react';
import Forbidden from './Forbidden';

export default function withAuth(
  Component: React.ComponentType<any>,
  roles: Role[] = ['admin', 'user', 'verifier']
): React.FC<any> {
  return function Protected(props: any) {
    const { isLoggedIn, role } = useAuth();
    const router = useRouter();
    useEffect(() => {
      if (!isLoggedIn) router.replace('/login');
    }, [isLoggedIn, router]);
    if (!isLoggedIn) return null;
    if (!roles.includes(role)) return <Forbidden />;
    return <Component {...props} />;
  };
}
