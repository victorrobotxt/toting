import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthProvider';
import { useEffect } from 'react';

export default function withAuth(Component: React.ComponentType<any>): React.FC<any> {
  return function Protected(props: any) {
    const { isLoggedIn } = useAuth();
    const router = useRouter();
    useEffect(() => {
      if (!isLoggedIn) router.replace('/login');
    }, [isLoggedIn, router]);
    if (!isLoggedIn) return null;
    return <Component {...props} />;
  };
}
